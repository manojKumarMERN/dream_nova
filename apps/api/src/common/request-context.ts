import type { Actor } from '@nova/auth';
import type { Request } from 'express';

export type NovaRequest = Request & {
  requestId: string;
  actor: Actor;
};
