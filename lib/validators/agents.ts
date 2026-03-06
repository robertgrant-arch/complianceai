import { z } from 'zod';

export const AgentsQuerySchema = z.object({
  search: z.string().max(200).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['agentName', 'callCount', 'avgScore']).optional().default('agentName'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const AgentCallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  dateFrom: z.string().optional().default(''),
  dateTo: z.string().optional().default(''),
});

export type AgentsQuery = z.infer<typeof AgentsQuerySchema>;
export type AgentCallsQuery = z.infer<typeof AgentCallsQuerySchema>;
