import { Controller, Get } from '@nestjs/common';
import { prisma } from '@nova/db';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  live(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'nova-api',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString()
    };
  }

  @Get('ready')
  async ready(): Promise<Record<string, unknown>> {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}
