import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { ORG_ROLES } from '@nova/auth';
import type { Actor, OrgRole } from '@nova/auth';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { NextFunction, Request, Response } from 'express';
import type { NovaRequest } from './request-context';

const ROLE_PRIORITY: readonly OrgRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

function unauthorized(message: string, details?: Record<string, unknown>): NovaError {
  return new NovaError(NovaErrorCodes.UNAUTHORIZED, message, {
    ...(details === undefined ? {} : { details })
  });
}

@Injectable()
export class ActorMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const isLocalDev = process.env['NODE_ENV'] !== 'production';
    const organizationId = request.header('x-org-id')?.trim() ?? '';
    const userId = request.header('x-user-id')?.trim() ?? '';
    const rolesHeader = request.header('x-user-roles') ?? '';

    if (organizationId === '' || userId === '') {
      if (!isLocalDev) {
        throw unauthorized('Actor headers are required');
      }
    }

    const providedRoles = rolesHeader
      .split(',')
      .map((role) => role.trim())
      .filter((role) => (ORG_ROLES as readonly string[]).includes(role));
    const role =
      ROLE_PRIORITY.find((candidate) => providedRoles.includes(candidate)) ??
      (isLocalDev ? 'OWNER' : undefined);

    if (role === undefined) {
      throw unauthorized('Actor role is required');
    }

    const actor: Actor = {
      organizationId: organizationId === '' ? 'dev-org' : organizationId,
      userId: userId === '' ? 'dev-user' : userId,
      role,
      actorType: 'USER'
    };

    (request as NovaRequest).actor = actor;
    next();
  }
}

export function requireActor(request: NovaRequest): Actor {
  if (request.actor === undefined) {
    throw unauthorized('Actor context is missing');
  }
  return request.actor;
}

export function requireExplicitActor(request: NovaRequest): Actor {
  const organizationId = request.header('x-org-id')?.trim() ?? '';
  const userId = request.header('x-user-id')?.trim() ?? '';
  if (organizationId === '' || userId === '') {
    throw unauthorized('Actor headers are required for runtime preview');
  }
  return requireActor(request);
}
