import { z } from 'zod';

export const PLATFORM_TARGETS = ['web', 'android', 'ios', 'windows', 'macos', 'linux'] as const;

export const platformTargetSchema = z.enum(PLATFORM_TARGETS);

export type PlatformTarget = z.infer<typeof platformTargetSchema>;
