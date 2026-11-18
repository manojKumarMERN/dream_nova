import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@nova/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-org-id', 'x-user-id', 'x-user-roles', 'x-trace-id']
  });
  app.setGlobalPrefix('api');

  const documentConfig = new DocumentBuilder()
    .setTitle('NOVA API')
    .setDescription('NOVA control-plane API boundaries')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.PORT);
}

void bootstrap();
