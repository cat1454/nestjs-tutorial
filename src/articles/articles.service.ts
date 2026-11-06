import { Injectable } from '@nestjs/common';

export interface Article {
  id: number;
  title: string;
}

@Injectable()
export class ArticlesService {
  private readonly articles: Article[] = [
    { id: 1, title: 'Learn NestJS' },
    { id: 2, title: 'Build REST API' },
  ];

  findAll(): Article[] {
    return this.articles;
  }

  findOne(id: number): Article | null {
    return this.articles.find((article) => article.id === id) ?? null;
  }
}
