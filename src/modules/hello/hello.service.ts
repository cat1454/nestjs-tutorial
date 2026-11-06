import { Injectable } from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { HelloDataDto } from './dto/hello-response.dto.js';

@Injectable()
export class HelloService {
  constructor(private readonly i18n: I18nService) {}

  async getGreeting(name = 'Sunner', lang?: string): Promise<{ message: string; data: HelloDataDto }> {
    const currentLang = lang || I18nContext.current()?.lang || 'en';

    const greeting = await this.i18n.t('common.greeting', {
      lang: currentLang,
      args: { name },
    });

    const healthCheck = await this.i18n.t('common.health_check', {
      lang: currentLang,
    });

    const data: HelloDataDto = {
      greeting,
      healthCheck,
      locale: currentLang,
      serverTime: new Date().toISOString(),
    };

    return {
      message: greeting,
      data,
    };
  }
}

