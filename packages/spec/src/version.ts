import { z } from 'zod';

export const SPEC_VERSION = '1.0' as const;

export const specVersionSchema = z.literal(SPEC_VERSION);

export type SpecVersion = z.infer<typeof specVersionSchema>;
