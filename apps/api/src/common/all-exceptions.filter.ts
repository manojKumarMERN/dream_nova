import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { Response } from 'express';
import { NovaError } from '@nova/errors';
import type { StructuredLogger } from '@nova/logging';
import type { NovaRequest } from './request-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<NovaRequest>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof NovaError) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const payload = exceptionResponse as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
        };
        if (typeof payload.code === 'string') {
          code = payload.code;
        }
        if (typeof payload.message === 'string') {
          message = payload.message;
        }
        if (payload.details !== undefined && typeof payload.details === 'object') {
          details = payload.details as Record<string, unknown>;
        }
      }
    }

    this.logger.error('request_failed', exception, {
      requestId,
      statusCode,
      code
    });

    response.status(statusCode).json({
      error: {
        code,
        message,
        requestId,
        ...(details === undefined ? {} : { details })
      }
    });
  }
}
