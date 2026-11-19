import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { TagsController } from './tags.controller.js';

describe('ArticlesController & TagsController', () => {
  let articlesController: ArticlesController;
  let tagsController: TagsController;
  let articlesService: Partial<Record<keyof ArticlesService, any>>;

  const mockCurrentUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    username: 'user1',
    token: 'jwt-token',
  };

  beforeEach(() => {
    articlesService = {
      listArticles: vi.fn().mockResolvedValue({ articles: [], articlesCount: 0 }),
      getFeed: vi.fn().mockResolvedValue({ articles: [], articlesCount: 0 }),
      getArticleBySlug: vi.fn().mockResolvedValue({ article: { slug: 'demo' } }),
      createArticle: vi.fn().mockResolvedValue({ article: { slug: 'created' } }),
      updateArticle: vi.fn().mockResolvedValue({ article: { slug: 'updated' } }),
      deleteArticle: vi.fn().mockResolvedValue({ message: 'Deleted' }),
      favoriteArticle: vi.fn().mockResolvedValue({ article: { favorited: true } }),
      unfavoriteArticle: vi.fn().mockResolvedValue({ article: { favorited: false } }),
      getTags: vi.fn().mockResolvedValue({ tags: ['nestjs'] }),
    };

    articlesController = new ArticlesController(
      articlesService as ArticlesService,
    );
    tagsController = new TagsController(articlesService as ArticlesService);
  });

  it('should delegate listArticles with query and optional user id', async () => {
    const query = { limit: 10, offset: 0, tag: 'nestjs' };
    await articlesController.listArticles(query, mockCurrentUser);
    expect(articlesService.listArticles).toHaveBeenCalledWith(
      query,
      mockCurrentUser.id,
    );
  });

  it('should delegate getFeed with query and current user id', async () => {
    const query = { limit: 10, offset: 0 };
    await articlesController.getFeed(query, mockCurrentUser);
    expect(articlesService.getFeed).toHaveBeenCalledWith(
      query,
      mockCurrentUser.id,
    );
  });

  it('should delegate getArticle with slug and optional user id', async () => {
    await articlesController.getArticle('demo-slug', undefined);
    expect(articlesService.getArticleBySlug).toHaveBeenCalledWith(
      'demo-slug',
      undefined,
    );
  });

  it('should delegate createArticle with dto and current user id', async () => {
    const dto = {
      article: { title: 'T', description: 'D', body: 'B' },
    };
    await articlesController.createArticle(dto, mockCurrentUser);
    expect(articlesService.createArticle).toHaveBeenCalledWith(
      dto,
      mockCurrentUser.id,
    );
  });

  it('should delegate updateArticle with slug, dto, and current user id', async () => {
    const dto = { article: { title: 'New' } };
    await articlesController.updateArticle('demo-slug', dto, mockCurrentUser);
    expect(articlesService.updateArticle).toHaveBeenCalledWith(
      'demo-slug',
      dto,
      mockCurrentUser.id,
    );
  });

  it('should delegate deleteArticle with slug and current user id', async () => {
    await articlesController.deleteArticle('demo-slug', mockCurrentUser);
    expect(articlesService.deleteArticle).toHaveBeenCalledWith(
      'demo-slug',
      mockCurrentUser.id,
    );
  });

  it('should delegate favoriteArticle and unfavoriteArticle', async () => {
    await articlesController.favoriteArticle('demo-slug', mockCurrentUser);
    expect(articlesService.favoriteArticle).toHaveBeenCalledWith(
      'demo-slug',
      mockCurrentUser.id,
    );

    await articlesController.unfavoriteArticle('demo-slug', mockCurrentUser);
    expect(articlesService.unfavoriteArticle).toHaveBeenCalledWith(
      'demo-slug',
      mockCurrentUser.id,
    );
  });

  it('should delegate getTags on TagsController', async () => {
    const res = await tagsController.getTags();
    expect(articlesService.getTags).toHaveBeenCalled();
    expect(res).toEqual({ tags: ['nestjs'] });
  });
});
