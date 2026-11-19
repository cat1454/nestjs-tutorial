import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  DEFAULT_LANGUAGE,
  PG_UNIQUE_VIOLATION_CODE,
} from '../auth/auth.constants.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import {
  MAX_SLUG_GENERATION_RETRIES,
  SLUG_BASE_MAX_LENGTH,
  SLUG_RANDOM_SUFFIX_BYTES,
} from './articles.constants.js';
import {
  ArticleDataDto,
  ArticleResponseDto,
  ArticlesListResponseDto,
  TagsResponseDto,
} from './dto/article-response.dto.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import {
  FeedArticlesQueryDto,
  ListArticlesQueryDto,
} from './dto/list-articles-query.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { ArticleEntity } from './entities/article.entity.js';
import { FavoriteEntity } from './entities/favorite.entity.js';
import { TagEntity } from './entities/tag.entity.js';

interface FavoriteCountRow {
  articleId: string;
  count: string;
}

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(ArticleEntity)
    private readonly articleRepository: Repository<ArticleEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectRepository(FavoriteEntity)
    private readonly favoriteRepository: Repository<FavoriteEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async listArticles(
    query: ListArticlesQueryDto,
    currentUserId?: string,
  ): Promise<ArticlesListResponseDto> {
    const qb = this.articleRepository
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.author', 'author')
      .leftJoinAndSelect('article.tags', 'tag');

    if (query.tag) {
      qb.innerJoin('article.tags', 'filterTag', 'filterTag.name = :tag', {
        tag: query.tag,
      });
    }

    if (query.author) {
      qb.andWhere('author.username = :author', { author: query.author });
    }

    if (query.favorited) {
      qb.innerJoin(
        FavoriteEntity,
        'filterFavorite',
        'filterFavorite.articleId = article.id',
      ).innerJoin(
        UserEntity,
        'filterFavoriteUser',
        'filterFavoriteUser.id = filterFavorite.userId AND filterFavoriteUser.username = :favorited',
        { favorited: query.favorited },
      );
    }

    qb.orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    const [articles, articlesCount] = await qb.getManyAndCount();
    const enriched = await this.enrichArticles(articles, currentUserId);

    return {
      articles: enriched,
      articlesCount,
    };
  }

  async getFeed(
    query: FeedArticlesQueryDto,
    currentUserId: string,
  ): Promise<ArticlesListResponseDto> {
    const qb = this.articleRepository
      .createQueryBuilder('article')
      .innerJoin(
        FollowEntity,
        'follow',
        'follow.followingId = article.authorId AND follow.followerId = :currentUserId',
        { currentUserId },
      )
      .leftJoinAndSelect('article.author', 'author')
      .leftJoinAndSelect('article.tags', 'tag')
      .orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    const [articles, articlesCount] = await qb.getManyAndCount();
    const enriched = await this.enrichArticles(articles, currentUserId);

    return {
      articles: enriched,
      articlesCount,
    };
  }

  async getArticleBySlug(
    slug: string,
    currentUserId?: string,
  ): Promise<ArticleResponseDto> {
    const article = await this.findArticleOrThrow(slug);
    const [enriched] = await this.enrichArticles([article], currentUserId);
    return { article: enriched };
  }

  async createArticle(
    dto: CreateArticleDto,
    currentUserId: string,
  ): Promise<ArticleResponseDto> {
    const author = await this.usersService.findById(currentUserId);
    if (!author) {
      const message = await this.i18n.t('errors.user_not_found', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }

    const { title, description, body, tagList } = dto.article;
    const normalizedTags = this.normalizeTagList(tagList);

    const savedArticle = await this.saveWithUniqueSlugRetry(async () => {
      return this.dataSource.transaction(async (manager) => {
        const tags = await this.resolveOrCreateTags(manager, normalizedTags);
        const article = manager.create(ArticleEntity, {
          slug: this.generateSlug(title),
          title,
          description,
          body,
          authorId: author.id,
          author,
          tags,
        });
        return manager.save(ArticleEntity, article);
      });
    });

    const [enriched] = await this.enrichArticles([savedArticle], currentUserId);
    return { article: enriched };
  }

  async updateArticle(
    slug: string,
    dto: UpdateArticleDto,
    currentUserId: string,
  ): Promise<ArticleResponseDto> {
    const article = await this.findArticleOrThrow(slug);
    await this.assertAuthorPermission(article, currentUserId);

    const { title, description, body } = dto.article;
    const isTitleChanged = title !== undefined && title !== article.title;

    if (title !== undefined) {
      article.title = title;
    }
    if (description !== undefined) {
      article.description = description;
    }
    if (body !== undefined) {
      article.body = body;
    }

    const updatedArticle = isTitleChanged
      ? await this.saveWithUniqueSlugRetry(async () => {
          article.slug = this.generateSlug(article.title);
          return this.articleRepository.save(article);
        })
      : await this.articleRepository.save(article);

    const [enriched] = await this.enrichArticles(
      [updatedArticle],
      currentUserId,
    );
    return { article: enriched };
  }

  async deleteArticle(
    slug: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    const article = await this.findArticleOrThrow(slug);
    await this.assertAuthorPermission(article, currentUserId);

    await this.articleRepository.delete({ id: article.id });

    const message = await this.i18n.t('common.article_deleted', {
      lang: this.lang,
    });
    return { message };
  }

  async favoriteArticle(
    slug: string,
    currentUserId: string,
  ): Promise<ArticleResponseDto> {
    const article = await this.findArticleOrThrow(slug);

    const alreadyFavorited = await this.favoriteRepository.exists({
      where: { userId: currentUserId, articleId: article.id },
    });

    if (!alreadyFavorited) {
      try {
        const favorite = this.favoriteRepository.create({
          userId: currentUserId,
          articleId: article.id,
        });
        await this.favoriteRepository.save(favorite);
      } catch (error: unknown) {
        const dbError = error as { code?: string };
        if (dbError?.code !== PG_UNIQUE_VIOLATION_CODE) {
          throw error;
        }
      }
    }

    const [enriched] = await this.enrichArticles([article], currentUserId);
    return { article: enriched };
  }

  async unfavoriteArticle(
    slug: string,
    currentUserId: string,
  ): Promise<ArticleResponseDto> {
    const article = await this.findArticleOrThrow(slug);

    await this.favoriteRepository.delete({
      userId: currentUserId,
      articleId: article.id,
    });

    const [enriched] = await this.enrichArticles([article], currentUserId);
    return { article: enriched };
  }

  async getTags(): Promise<TagsResponseDto> {
    const tags = await this.tagRepository.find({
      order: { name: 'ASC' },
    });
    return {
      tags: tags.map((tag) => tag.name),
    };
  }

  private async findArticleOrThrow(slug: string): Promise<ArticleEntity> {
    const article = await this.articleRepository.findOne({
      where: { slug: slug.trim() },
      relations: { author: true, tags: true },
    });

    if (!article) {
      const message = await this.i18n.t('errors.article_not_found', {
        lang: this.lang,
      });
      throw new NotFoundException(message);
    }

    return article;
  }

  private async assertAuthorPermission(
    article: ArticleEntity,
    currentUserId: string,
  ): Promise<void> {
    if (article.authorId !== currentUserId) {
      const message = await this.i18n.t('errors.article_forbidden', {
        lang: this.lang,
      });
      throw new ForbiddenException(message);
    }
  }

  private async resolveOrCreateTags(
    manager: EntityManager,
    tagNames: string[],
  ): Promise<TagEntity[]> {
    if (tagNames.length === 0) {
      return [];
    }

    await manager
      .createQueryBuilder()
      .insert()
      .into(TagEntity)
      .values(tagNames.map((name) => ({ name })))
      .orIgnore()
      .execute();

    return manager.find(TagEntity, {
      where: { name: In(tagNames) },
    });
  }

  private async enrichArticles(
    articles: ArticleEntity[],
    currentUserId?: string,
  ): Promise<ArticleDataDto[]> {
    if (articles.length === 0) {
      return [];
    }

    const articleIds = articles.map((article) => article.id);
    const authorIds = Array.from(
      new Set(articles.map((article) => article.authorId)),
    );

    const favoriteCountRows = await this.favoriteRepository
      .createQueryBuilder('favorite')
      .select('favorite.articleId', 'articleId')
      .addSelect('COUNT(*)', 'count')
      .where('favorite.articleId IN (:...articleIds)', { articleIds })
      .groupBy('favorite.articleId')
      .getRawMany<FavoriteCountRow>();

    const favoritesCountMap = new Map<string, number>();
    for (const row of favoriteCountRows) {
      favoritesCountMap.set(row.articleId, Number(row.count));
    }

    const favoritedSet = new Set<string>();
    const followingAuthorSet = new Set<string>();

    if (currentUserId) {
      const [userFavorites, userFollows] = await Promise.all([
        this.favoriteRepository.find({
          select: { articleId: true },
          where: { userId: currentUserId, articleId: In(articleIds) },
        }),
        this.followRepository.find({
          select: { followingId: true },
          where: { followerId: currentUserId, followingId: In(authorIds) },
        }),
      ]);

      for (const fav of userFavorites) {
        favoritedSet.add(fav.articleId);
      }
      for (const follow of userFollows) {
        followingAuthorSet.add(follow.followingId);
      }
    }

    return articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: (article.tags ?? []).map((tag) => tag.name).sort(),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      favorited: favoritedSet.has(article.id),
      favoritesCount: favoritesCountMap.get(article.id) ?? 0,
      author: {
        username: article.author.username,
        bio: article.author.bio,
        image: article.author.image,
        following: followingAuthorSet.has(article.authorId),
      },
    }));
  }

  private normalizeTagList(tagList?: string[]): string[] {
    if (!tagList || tagList.length === 0) {
      return [];
    }
    return Array.from(
      new Set(
        tagList.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ''),
      ),
    );
  }

  private generateSlug(title: string): string {
    const base = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_BASE_MAX_LENGTH);

    const suffix = randomBytes(SLUG_RANDOM_SUFFIX_BYTES).toString('hex');
    return `${base || 'article'}-${suffix}`;
  }

  private async saveWithUniqueSlugRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SLUG_GENERATION_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        const dbError = error as { code?: string };
        const isRetryable =
          dbError?.code === PG_UNIQUE_VIOLATION_CODE &&
          attempt < MAX_SLUG_GENERATION_RETRIES;
        if (!isRetryable) {
          throw error;
        }
      }
    }
    return operation();
  }
}
