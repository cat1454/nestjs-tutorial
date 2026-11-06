import { Test, TestingModule } from '@nestjs/testing';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { describe, expect, it, vi } from 'vitest';
import { HelloController } from './hello.controller.js';
import { HelloService } from './hello.service.js';

describe('HelloController & HelloService', () => {
  let controller: HelloController;
  let service: HelloService;

  const mockI18nService = {
    t: vi.fn((key: string, options?: { lang?: string; args?: { name?: string } }) => {
      const name = options?.args?.name || 'Sunner';
      const lang = options?.lang || 'en';
      if (key === 'common.greeting') {
        return Promise.resolve(
          lang === 'vi'
            ? `Xin chào ${name}! Chào mừng bạn đến với Sun* NestJS Tutorial API.`
            : `Hello, ${name}! Welcome to Sun* NestJS Tutorial API.`,
        );
      }
      if (key === 'common.health_check') {
        return Promise.resolve(
          lang === 'vi'
            ? 'Hệ thống đang hoạt động ổn định và sẵn sàng.'
            : 'System is healthy and operational.',
        );
      }
      return Promise.resolve(key);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HelloController],
      providers: [
        HelloService,
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    controller = module.get<HelloController>(HelloController);
    service = module.get<HelloService>(HelloService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('getHello', () => {
    it('should return English greeting by default', async () => {
      const mockContext = { lang: 'en' } as I18nContext;
      const result = await controller.getHello({}, mockContext);

      expect(result.data.greeting).toContain('Hello, Sunner!');
      expect(result.data.locale).toBe('en');
    });

    it('should return Vietnamese greeting when lang is vi', async () => {
      const mockContext = { lang: 'vi' } as I18nContext;
      const result = await controller.getHello(
        { name: 'Developer', lang: 'vi' },
        mockContext,
      );

      expect(result.data.greeting).toContain('Xin chào Developer!');
      expect(result.data.locale).toBe('vi');
    });
  });
});
