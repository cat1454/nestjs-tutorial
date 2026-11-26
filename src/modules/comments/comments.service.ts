import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { DEFAULT_LANGUAGE } from '../auth/auth.constants.js';
import { MailService } from '../mail/mail.service.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import {
  CommentDataDto,
  CommentResponseDto,
  CommentsListResponseDto,
} from './dto/comment-response.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CommentEntity } from './entities/comment.entity.js';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentRepository: Repository<CommentEntity>,
    @InjectRepository(ArticleEntity)
    private readonly articleRepository: Repository<ArticleEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly mailService: MailService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async addComment(
    slug: string,
    dto: CreateCommentDto,
    currentUserId: string,
  ): Promise<CommentResponseDto> {
    const article = await this.findArticleBySlugOrThrow(slug, true);

    const comment = this.commentRepository.create({
      body: dto.comment.body.trim(),
      articleId: article.id,
      authorId: currentUserId,
    });
    const saved = await this.commentRepository.save(comment);

    const commentWithAuthor = await this.commentRepository.findOneOrFail({
      where: { id: saved.id },
      relations: { author: true },
    });

    if (article.author && article.author.id !== currentUserId) {
      try {
        await this.mailService.sendNewCommentNotification({
          recipientEmail: article.author.email,
          recipientUsername: article.author.username,
          commenterUsername: commentWithAuthor.author.username,
          articleTitle: article.title,
          articleSlug: article.slug,
          commentBody: commentWithAuthor.body,
          lang: this.lang,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue new comment notification email for article "${article.slug}": ${(error as Error).message}`,
        );
      }
    }

    return {
      comment: this.buildCommentData(commentWithAuthor, false),
    };
  }

  async getCommentsBySlug(
    slug: string,
    currentUserId?: string,
  ): Promise<CommentsListResponseDto> {
    const article = await this.findArticleBySlugOrThrow(slug, false);

    const comments = await this.commentRepository.find({
      where: { articleId: article.id },
      relations: { author: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    if (comments.length === 0) {
      return { comments: [] };
    }

    const followingAuthorIds = await this.getFollowingAuthorIds(
      currentUserId,
      comments.map((comment) => comment.authorId),
    );

    return {
      comments: comments.map((comment) =>
        this.buildCommentData(comment, followingAuthorIds.has(comment.authorId)),
      ),
    };
  }

  async deleteComment(
    slug: string,
    commentId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    const article = await this.findArticleBySlugOrThrow(slug, false);

    const comment = await this.commentRepository.findOne({
      where: { id: commentId, articleId: article.id },
    });

    if (!comment) {
      const message = await this.i18n.t('errors.comment_not_found', {
        lang: this.lang,
      });
      throw new NotFoundException(message);
    }

    if (comment.authorId !== currentUserId) {
      const message = await this.i18n.t('errors.comment_forbidden', {
        lang: this.lang,
      });
      throw new ForbiddenException(message);
    }

    await this.commentRepository.delete({ id: comment.id });

    const message = await this.i18n.t('common.comment_deleted', {
      lang: this.lang,
    });
    return { message };
  }

  private async findArticleBySlugOrThrow(
    slug: string,
    includeAuthor: boolean,
  ): Promise<ArticleEntity> {
    const normalizedSlug = slug.trim();
    const article = await this.articleRepository.findOne({
      where: { slug: normalizedSlug },
      relations: includeAuthor ? { author: true } : undefined,
    });

    if (!article) {
      const message = await this.i18n.t('errors.article_not_found', {
        lang: this.lang,
      });
      throw new NotFoundException(message);
    }

    return article;
  }

  private async getFollowingAuthorIds(
    currentUserId: string | undefined,
    authorIds: string[],
  ): Promise<Set<string>> {
    if (!currentUserId || authorIds.length === 0) {
      return new Set<string>();
    }

    const uniqueAuthorIds = Array.from(
      new Set(authorIds.filter((id) => id !== currentUserId)),
    );
    if (uniqueAuthorIds.length === 0) {
      return new Set<string>();
    }

    const follows = await this.followRepository.find({
      where: {
        followerId: currentUserId,
        followingId: In(uniqueAuthorIds),
      },
      select: { followingId: true },
    });

    return new Set(follows.map((follow) => follow.followingId));
  }

  private buildCommentData(
    comment: CommentEntity,
    following: boolean,
  ): CommentDataDto {
    return {
      id: comment.id,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      body: comment.body,
      author: {
        username: comment.author.username,
        bio: comment.author.bio,
        image: comment.author.image,
        following,
      },
    };
  }
}
