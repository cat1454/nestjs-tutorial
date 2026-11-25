import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

describe('CommentsController', () => {
  let controller: CommentsController;
  let commentsService: Record<string, any>;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user1',
    jti: 'jti-1',
    iatMs: Date.now(),
  };

  beforeEach(async () => {
    commentsService = {
      addComment: vi.fn(),
      getCommentsBySlug: vi.fn(),
      deleteComment: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: commentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommentsController>(CommentsController);
  });

  it('addComment should delegate to commentsService.addComment', async () => {
    const dto = { comment: { body: 'Nice article' } };
    const expected = { comment: { id: 'c-1', body: 'Nice article' } };
    commentsService.addComment.mockResolvedValue(expected);

    const res = await controller.addComment('my-slug', dto, mockUser);
    expect(commentsService.addComment).toHaveBeenCalledWith(
      'my-slug',
      dto,
      mockUser.id,
    );
    expect(res).toEqual(expected);
  });

  it('getComments should delegate to commentsService.getCommentsBySlug', async () => {
    const expected = { comments: [] };
    commentsService.getCommentsBySlug.mockResolvedValue(expected);

    const res = await controller.getComments('my-slug', mockUser);
    expect(commentsService.getCommentsBySlug).toHaveBeenCalledWith(
      'my-slug',
      mockUser.id,
    );
    expect(res).toEqual(expected);
  });

  it('deleteComment should delegate to commentsService.deleteComment', async () => {
    const expected = { message: 'Comment deleted successfully' };
    commentsService.deleteComment.mockResolvedValue(expected);

    const res = await controller.deleteComment(
      'my-slug',
      '550e8400-e29b-41d4-a716-446655440000',
      mockUser,
    );
    expect(commentsService.deleteComment).toHaveBeenCalledWith(
      'my-slug',
      '550e8400-e29b-41d4-a716-446655440000',
      mockUser.id,
    );
    expect(res).toEqual(expected);
  });
});
