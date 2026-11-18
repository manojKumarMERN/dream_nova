import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { NovaRequest } from './request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const headerValue = request.header('x-request-id');
    const requestId = headerValue === undefined || headerValue === '' ? randomUUID() : headerValue;

    (request as NovaRequest).requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
