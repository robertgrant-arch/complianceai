import { z } from 'zod';

export const ExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).optional().default('csv'),
  type: z.enum(['calls', 'flags', 'agents']).optional().default('calls'),
  search: z.string().max(200).optional().default(''),
  status: z.string().max(50).optional().default(''),
  campaign: z.string().max(200).optional().default(''),
  agentId: z.string().max(100).optional().default(''),
  dateFrom: z.string().optional().default(''),
  dateTo: z.string().optional().default(''),
});

export type ExportQuery = z.infer<typeof ExportQuerySchema>;
