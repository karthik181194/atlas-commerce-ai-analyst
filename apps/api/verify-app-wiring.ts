import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { BusinessAnalystService } from './src/analytics/business-analyst.service';
import path from 'path';

async function bootstrap() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  } catch (e) {
    // Ignore
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const service = app.get(BusinessAnalystService);
    if (service) {
      console.log('BusinessAnalystService resolved successfully');
    }
  } catch (e: any) {
    console.error('Failed to resolve BusinessAnalystService:', e.message);
  } finally {
    await app.close();
  }
}

bootstrap();

