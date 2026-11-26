import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { MailService } from '../mail/mail.service.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { CommentsService } from './comments.service.js';
import { CommentEntity } from './entities/comment.entity.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepo: Record<string, any>;
  let articleRepo: Record<string, any>;
  let followRepo: Record<string, any>;
  let mailService: Record<string, any>;
  let i18nService: Record<string, any>;

  const authorUser: UserEntity = {
    id: 'user-author',
    username: 'articleAuthor',
    email: 'author@example.com',
    password: 'hash',
    bio: 'Author bio',
    image: null,
    createdAt: new Date('2026-11-25T00:00:00.000Z'),
    updatedAt: new Date('2026-11-25T00:00:00.000Z'),
  };

  const commenterUser: UserEntity = {
    id: 'user-commenter',
    username: 'commenter',
    email: 'commenter@example.com',
    password: 'hash',
    bio: null,
    image: '/public/uploads/avatars/a.png',
    createdAt: new Date('2026-11-25T00:00:00.000Z'),
    updatedAt: new Date('2026-11-25T00:00:00.000Z'),
  };

  const article: ArticleEntity = {
    id: 'article-1',
    slug: 'nestjs-queues-1234',
    title: 'NestJS Queues',
    description: 'Desc',
    body: 'Body',
    authorId: authorUser.id,
    author: authorUser,
    tags: [],
    createdAt: new Date('2026-11-25T01:00:00.000Z'),
    updatedAt: new Date('2026-11-25T01:00:00.000Z'),
  };

  const savedComment: CommentEntity = {
    id: 'comment-1',
    body: 'Great post!',
    articleId: article.id,
    article,
    authorId: commenterUser.id,
    author: commenterUser,
    createdAt: new Date('2026-11-25T02:00:00.000Z'),
    updatedAt: new Date('2026-11-25T02:00:00.000Z'),
  };

  beforeEach(async () => {
    commentRepo = {
      create: vi.fn((data) => data),
      save: vi.fn(),
      findOne: vi.fn(),
      findOneOrFail: vi.fn(),
      find: vi.fn(),
      delete: vi.fn(),
    };

    articleRepo = {
      findOne: vi.fn(),
    };

    followRepo = {
      find: vi.fn(),
    };

    mailService = {
      sendNewCommentNotification: vi.fn().mockResolvedValue(undefined),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
        { provide: getRepositoryToken(ArticleEntity), useValue: articleRepo },
        { provide: getRepositoryToken(FollowEntity), useValue: followRepo },
        { provide: MailService, useValue: mailService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  describe('addComment', () => {
    it('should create comment and enqueue notification email when commenter is not article author', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.save.mockResolvedValue({ id: savedComment.id });
      commentRepo.findOneOrFail.mockResolvedValue(savedComment);

      const res = await service.addComment(
        ' nestjs-queues-1234 ',
        { comment: { body: '  Great post!  ' } },
        commenterUser.id,
      );

      expect(commentRepo.create).toHaveBeenCalledWith({
        body: 'Great post!',
        articleId: article.id,
        authorId: commenterUser.id,
      });
      expect(mailService.sendNewCommentNotification).toHaveBeenCalledWith({
        recipientEmail: authorUser.email,
        recipientUsername: authorUser.username,
        commenterUsername: commenterUser.username,
        articleTitle: article.title,
        articleSlug: article.slug,
        commentBody: 'Great post!',
        lang: 'en',
      });
      expect(res.comment).toEqual({
        id: savedComment.id,
        createdAt: savedComment.createdAt.toISOString(),
        updatedAt: savedComment.updatedAt.toISOString(),
        body: 'Great post!',
        author: {
          username: commenterUser.username,
          bio: commenterUser.bio,
          image: commenterUser.image,
          following: false,
        },
      });
    });

    it('should NOT enqueue notification email when author comments on own article', async () => {
      const ownComment = {
        ...savedComment,
        authorId: authorUser.id,
        author: authorUser,
      };
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.save.mockResolvedValue({ id: ownComment.id });
      commentRepo.findOneOrFail.mockResolvedValue(ownComment);

      await service.addComment(
        article.slug,
        { comment: { body: 'Self reply' } },
        authorUser.id,
      );

      expect(mailService.sendNewCommentNotification).not.toHaveBeenCalled();
    });

    it('should still return created comment if mail enqueue throws', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.save.mockResolvedValue({ id: savedComment.id });
      commentRepo.findOneOrFail.mockResolvedValue(savedComment);
      mailService.sendNewCommentNotification.mockRejectedValueOnce(
        new Error('Redis unavailable'),
      );

      const res = await service.addComment(
        article.slug,
        { comment: { body: 'Great post!' } },
        commenterUser.id,
      );

      expect(res.comment.id).toBe(savedComment.id);
    });

    it('should throw NotFoundException when article does not exist', async () => {
      articleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addComment(
          'missing-slug',
          { comment: { body: 'Hello' } },
          commenterUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCommentsBySlug', () => {
    it('should return empty comments list when article has no comments', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.find.mockResolvedValue([]);

      const res = await service.getCommentsBySlug(article.slug);
      expect(res).toEqual({ comments: [] });
      expect(followRepo.find).not.toHaveBeenCalled();
    });

    it('should return comments with following flag resolved for authenticated user', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.find.mockResolvedValue([savedComment]);
      followRepo.find.mockResolvedValue([{ followingId: commenterUser.id }]);

      const res = await service.getCommentsBySlug(article.slug, authorUser.id);
      expect(commentRepo.find).toHaveBeenCalledWith({
        where: { articleId: article.id },
        relations: { author: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].author.following).toBe(true);
    });

    it('should return following=false when viewer is unauthenticated', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.find.mockResolvedValue([savedComment]);

      const res = await service.getCommentsBySlug(article.slug);
      expect(res.comments[0].author.following).toBe(false);
      expect(followRepo.find).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when article does not exist', async () => {
      articleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getCommentsBySlug('missing-slug'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteComment', () => {
    it('should delete comment when current user is the author', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.findOne.mockResolvedValue(savedComment);
      commentRepo.delete.mockResolvedValue({ affected: 1 });

      const res = await service.deleteComment(
        article.slug,
        savedComment.id,
        commenterUser.id,
      );

      expect(commentRepo.delete).toHaveBeenCalledWith({ id: savedComment.id });
      expect(res).toEqual({ message: 'common.comment_deleted' });
    });

    it('should throw NotFoundException when comment does not exist for article', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment(article.slug, 'non-existent', commenterUser.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when another user attempts to delete', async () => {
      articleRepo.findOne.mockResolvedValue(article);
      commentRepo.findOne.mockResolvedValue(savedComment);

      await expect(
        service.deleteComment(article.slug, savedComment.id, authorUser.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
