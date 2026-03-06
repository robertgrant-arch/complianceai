/**
 * lib/types/transcript.ts
 * Typed interfaces for transcript data structures (M-02)
 */
import { z } from 'zod';

// ── Transcript segment ─────────────────────────────────────────────────────────
export const TranscriptSegmentSchema = z.object({
  speaker: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const TranscriptSegmentsSchema = z.array(TranscriptSegmentSchema);

// ── Keyword item stored in KeywordList.keywords JSON ──────────────────────────
export const KeywordItemSchema = z.object({
  word: z.string().min(1),
  isCaseSensitive: z.boolean().default(false),
  isRegex: z.boolean().default(false),
});

export type KeywordItem = z.infer<typeof KeywordItemSchema>;

export const KeywordItemsSchema = z.array(KeywordItemSchema);

// ── Audit flag shape (used in analysis results) ────────────────────────────────
export interface AuditFlagShape {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: string;
  description: string;
  timestamp?: number;
  keyword?: string;
  quote?: string;
}

// ── GPT analysis result shape ─────────────────────────────────────────────────
export interface GptAnalysisResult {
  overallScore: number;
  complianceScore: number;
  toneScore: number;
  qualityScore: number;
  summary: string;
  recommendedAction: 'none' | 'coaching' | 'review' | 'escalate';
  sentimentAgent: 'positive' | 'neutral' | 'negative';
  sentimentCustomer: 'positive' | 'neutral' | 'negative';
  topicsDiscussed: string[];
  callOutcome?: string;
  flags: AuditFlagShape[];
}

/**
 * Safely parse transcript segments from a Prisma Json field.
 * Returns an empty array if the data is invalid rather than throwing.
 */
export function parseTranscriptSegments(raw: unknown): TranscriptSegment[] {
  const result = TranscriptSegmentsSchema.safeParse(raw);
  if (result.success) return result.data;
  console.warn('[parseTranscriptSegments] Invalid segment data:', result.error.message);
  return [];
}

/**
 * Safely parse keyword items from a Prisma Json field.
 */
export function parseKeywordItems(raw: unknown): KeywordItem[] {
  const result = KeywordItemsSchema.safeParse(raw);
  if (result.success) return result.data;
  return [];
}
