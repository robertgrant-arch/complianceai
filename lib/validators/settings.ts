import { z } from 'zod';

export const UpdateSettingsSchema = z
  .record(z.string().min(1).max(200), z.unknown())
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one setting key required' });

export const RetentionPolicySchema = z.object({
  completed: z.coerce.number().int().min(1).max(3650),
  error: z.coerce.number().int().min(1).max(3650),
  pending: z.coerce.number().int().min(1).max(3650),
});

export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
