import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PG_UNIQUE_VIOLATION_CODE } from '../auth/auth.constants.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ArticlesService } from './articles.service.js';
import { ArticleEntity } from './entities/article.entity.js';
import { FavoriteEntity } from './entities/favorite.entity.js';
import { TagEntity } from './entities/tag.entity.js';

describe('ArticlesService', () => {
  let articlesService: ArticlesService;
  let articleRepository: Partial<Record<keyof Repository<ArticleEntity>, any>>;
  let tagRepository: Partial<Record<keyof Repository<TagEntity>, any>>;
  let favoriteRepository: Partial<
    Record<keyof Repository<FavoriteEntity>, any>
  >;
  let followRepository: Partial<Record<keyof Repository<FollowEntity>, any>>;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let dataSource: Partial<Record<keyof DataSource, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const mockAuthor: UserEntity = {
    id: 'author-uuid-1',
    username: 'author1',
    email: 'author1@example.com',
    password: 'hashed-password',
    bio: 'Author bio',
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockArticle: ArticleEntity = {
    id: 'article-uuid-1',
    slug: 'clean-nestjs-1234abcd',
    title: 'Clean NestJS',
    description: 'Clean architecture guide',
    body: 'Detailed body content',
    authorId: 'author-uuid-1',
    author: mockAuthor,
    tags: [
      { id: 'tag-1', name: 'nestjs', createdAt: new Date() },
      { id: 'tag-2', name: 'backend', createdAt: new Date() },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const favoriteQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };

    articleRepository = {
      findOne: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    tagRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    favoriteRepository = {
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn().mockReturnValue(favoriteQueryBuilder),
    };

    followRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    usersService = {
      findById: vi.fn(),
    };

    const insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };

    const mockManager = {
      createQueryBuilder: vi.fn().mockReturnValue(insertBuilder),
      find: vi.fn().mockResolvedValue(mockArticle.tags),
      create: vi.fn((_entity, data) => ({
        id: 'article-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      save: vi.fn((_entity, data) => Promise.resolve(data)),
    };

    dataSource = {
      transaction: vi.fn(async (cb: (manager: any) => Promise<any>) =>
        cb(mockManager),
      ),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        {
          provide: getRepositoryToken(ArticleEntity),
          useValue: articleRepository,
        },
        { provide: getRepositoryToken(TagEntity), useValue: tagRepository },
        {
          provide: getRepositoryToken(FavoriteEntity),
          useValue: favoriteRepository,
        },
        {
          provide: getRepositoryToken(FollowEntity),
          useValue: followRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: DataSource, useValue: dataSource },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    articlesService = module.get<ArticlesService>(ArticlesService);
  });

  describe('createArticle', () => {
    it('should create an article with unique ASCII slug from Vietnamese title and sorted tags', async () => {
      usersService.findById!.mockResolvedValue(mockAuthor);

      const res = await articlesService.createArticle(
        {
          article: {
            title: 'Hướng dẫn NestJS chuẩn mực',
            description: 'Mô tả bài viết',
            body: 'Nội dung chi tiết',
            tagList: ['NestJS', 'backend', 'nestjs'],
          },
        },
        mockAuthor.id,
      );

      expect(res.article.slug).toMatch(
        /^huong-dan-nestjs-chuan-muc-[0-9a-f]{8}$/,
      );
      expect(res.article.tagList).toEqual(['backend', 'nestjs']);
      expect(res.article.author.username).toBe('author1');
      expect(res.article.favoritesCount).toBe(0);
    });

    it('should throw UnauthorizedException when author no longer exists', async () => {
      usersService.findById!.mockResolvedValue(null);

      await expect(
        articlesService.createArticle(
          {
            article: {
              title: 'Test',
              description: 'Desc',
              body: 'Body',
            },
          },
          'missing-user-id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getArticleBySlug', () => {
    it('should return enriched article when slug exists', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      const res = await articlesService.getArticleBySlug(mockArticle.slug);

      expect(res.article.title).toBe('Clean NestJS');
      expect(res.article.tagList).toEqual(['backend', 'nestjs']);
    });

    it('should throw NotFoundException when slug does not exist', async () => {
      articleRepository.findOne!.mockResolvedValue(null);

      await expect(
        articlesService.getArticleBySlug('unknown-slug'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateArticle', () => {
    it('should update title, regenerate slug, and return updated article for author', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      const res = await articlesService.updateArticle(
        mockArticle.slug,
        {
          article: {
            title: 'New Title Here',
            description: 'Updated description',
          },
        },
        mockAuthor.id,
      );

      expect(res.article.title).toBe('New Title Here');
      expect(res.article.slug).toMatch(/^new-title-here-[0-9a-f]{8}$/);
      expect(res.article.description).toBe('Updated description');
    });

    it('should throw ForbiddenException when non-author attempts to update article', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      await expect(
        articlesService.updateArticle(
          mockArticle.slug,
          { article: { title: 'Hacked' } },
          'another-user-id',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteArticle', () => {
    it('should delete article and return localized message for author', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      const res = await articlesService.deleteArticle(
        mockArticle.slug,
        mockAuthor.id,
      );

      expect(articleRepository.delete).toHaveBeenCalledWith({
        id: mockArticle.id,
      });
      expect(res.message).toBe('common.article_deleted');
    });

    it('should throw ForbiddenException when non-author attempts to delete article', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      await expect(
        articlesService.deleteArticle(mockArticle.slug, 'another-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('favorite & unfavorite', () => {
    it('should handle concurrent duplicate favorite (23505) gracefully', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });
      favoriteRepository.exists!.mockResolvedValue(false);
      favoriteRepository.save!.mockRejectedValue({
        code: PG_UNIQUE_VIOLATION_CODE,
      });

      const res = await articlesService.favoriteArticle(
        mockArticle.slug,
        'reader-uuid',
      );

      expect(res.article.slug).toBe(mockArticle.slug);
    });

    it('should delete favorite record on unfavorite', async () => {
      articleRepository.findOne!.mockResolvedValue({ ...mockArticle });

      await articlesService.unfavoriteArticle(mockArticle.slug, 'reader-uuid');

      expect(favoriteRepository.delete).toHaveBeenCalledWith({
        userId: 'reader-uuid',
        articleId: mockArticle.id,
      });
    });
  });

  describe('getTags', () => {
    it('should return sorted tag names', async () => {
      tagRepository.find!.mockResolvedValue([
        { id: '1', name: 'backend', createdAt: new Date() },
        { id: '2', name: 'nestjs', createdAt: new Date() },
      ]);

      const res = await articlesService.getTags();

      expect(res.tags).toEqual(['backend', 'nestjs']);
    });
  });
});
