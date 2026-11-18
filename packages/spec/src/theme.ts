import { z } from 'zod';

export const themeTokenSetSchema = z.object({
  colors: z.record(z.string().min(1)).default({}),
  spacing: z.record(z.number().nonnegative()).default({}),
  typography: z.record(z.string().min(1)).default({}),
  borderRadius: z.record(z.number().nonnegative()).default({}),
  shadows: z.record(z.string().min(1)).default({}),
  components: z.record(z.record(z.unknown())).default({})
});

export type ThemeTokenSet = z.infer<typeof themeTokenSetSchema>;
