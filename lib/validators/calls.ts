import { z } from 'zod';

export const CallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional().default(''),
  status: z
    .enum(['pending', 'transcribing', 'analyzing', 'completed', 'error', ''])
    .optional()
    .default(''),
  agentId: z.string().max(100).optional().default(''),
  campaign: z.string().max(200).optional().default(''),
  direction: z.enum(['inbound', 'outbound', '']).optional().default(''),
  dateFrom: z.string().optional().default(''),
  dateTo: z.string().optional().default(''),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  flagType: z.enum(['CRITICAL', 'WARNING', 'INFO', '']).optional().default(''),
  sortBy: z
    .enum(['startTime', 'duration', 'agentName', 'campaignName', 'overallScore'])
    .optional()
    .default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const CallPatchSchema = z.object({
  notes: z.string().max(5000).optional(),
  reviewedBy: z.string().max(200).optional(),
  reviewedAt: z.string().datetime().optional(),
  status: z.enum(['pending', 'transcribing', 'analyzing', 'completed', 'error']).optional(),
});

export type CallsQuery = z.infer<typeof CallsQuerySchema>;
export type CallPatch = z.infer<typeof CallPatchSchema>;
