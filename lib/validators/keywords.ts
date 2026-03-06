import { z } from 'zod';

export const KeywordListTypeEnum = z.enum(['prohibited', 'required', 'risk', 'competitor']);

export const CreateKeywordListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: KeywordListTypeEnum,
  isActive: z.boolean().optional().default(true),
});

export const PatchKeywordListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const AddKeywordSchema = z.object({
  word: z
    .string()
    .min(1, 'Keyword must not be empty')
    .max(300, 'Keyword too long'),
  isCaseSensitive: z.boolean().optional().default(false),
  isRegex: z.boolean().optional().default(false),
});

export const DeleteKeywordSchema = z.object({
  keywordId: z.string().cuid('Invalid keyword ID'),
});

export type CreateKeywordList = z.infer<typeof CreateKeywordListSchema>;
export type PatchKeywordList = z.infer<typeof PatchKeywordListSchema>;
export type AddKeyword = z.infer<typeof AddKeywordSchema>;
export type DeleteKeyword = z.infer<typeof DeleteKeywordSchema>;
