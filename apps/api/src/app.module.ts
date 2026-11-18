import { Module } from '@nestjs/common';
import type { MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { createJsonLogger } from '@nova/logging';
import type { LogLevel, StructuredLogger } from '@nova/logging';
import { ActorMiddleware } from './common/actor.middleware';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { HealthController } from './health/health.controller';
import { PlatformModule } from './platform/platform.module';
import { RegistryController } from './registry/registry.controller';
import { ValidationController } from './validation/validation.controller';

const NOVA_LOGGER = 'NOVA_LOGGER';

function resolveLogLevel(value: string | undefined): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
    ? value
    : 'info';
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PlatformModule],
  controllers: [HealthController, RegistryController, ValidationController],
  providers: [
    {
      provide: NOVA_LOGGER,
      useFactory: (): StructuredLogger =>
        createJsonLogger({
          service: process.env['SERVICE_NAME'] ?? 'nova-api',
          level: resolveLogLevel(process.env['LOG_LEVEL'])
        })
    },
    {
      provide: APP_FILTER,
      inject: [NOVA_LOGGER],
      useFactory: (logger: StructuredLogger): AllExceptionsFilter => new AllExceptionsFilter(logger)
    }
  ]
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, ActorMiddleware).forRoutes('{*path}');
  }
}
