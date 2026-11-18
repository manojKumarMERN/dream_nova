import { z } from 'zod';

export const idSchema = z.string().uuid();

export const shortNameSchema = z.string().min(1).max(120);

export const contractVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Expected semantic version');
