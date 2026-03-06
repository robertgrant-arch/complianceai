/**
 * lib/audit.ts
 *
 * H-02: Read operations are only logged when the system setting
 *       audit_log_reads=true. This prevents the audit log from being
 *       flooded with GET requests and keeps it focused on mutations.
 *
 * M-06: AuditActions is a typed const object — all action strings are
 *       centralized here so callers get autocomplete and no typos.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

// M-06: Typed audit action constants — single source of truth
export const AuditActions = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',

  // CRUD
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  // Call-specific
  CALL_REVIEWED: 'CALL_REVIEWED',
  CALL_ASSIGNED_COACHING: 'CALL_ASSIGNED_COACHING',
  CALL_EXPORTED: 'CALL_EXPORTED',
  CALL_NOTE_ADDED: 'CALL_NOTE_ADDED',

  // Settings
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  KEYWORD_LIST_UPDATED: 'KEYWORD_LIST_UPDATED',
  RETENTION_POLICY_UPDATED: 'RETENTION_POLICY_UPDATED',

  // Worker
  INGESTION_STARTED: 'INGESTION_STARTED',
  INGESTION_COMPLETED: 'INGESTION_COMPLETED',
  TRANSCRIPTION_COMPLETED: 'TRANSCRIPTION_COMPLETED',
  ANALYSIS_COMPLETED: 'ANALYSIS_COMPLETED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/** Read-only actions that are suppressed unless audit_log_reads is enabled */
const READ_ACTIONS = new Set<AuditAction>([AuditActions.READ]);

/**
 * H-02: Cache the audit_log_reads setting in memory for 60 seconds
 * to avoid a DB query on every API request.
 */
let _auditReadsEnabled: boolean | null = null;
let _auditReadsCachedAt = 0;
const AUDIT_READS_CACHE_TTL_MS = 60_000;

async function isAuditReadsEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_auditReadsEnabled !== null && now - _auditReadsCachedAt < AUDIT_READS_CACHE_TTL_MS) {
    return _auditReadsEnabled;
  }
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'audit_log_reads' },
    });
    _auditReadsEnabled = setting?.value === 'true';
    _auditReadsCachedAt = now;
  } catch {
    _auditReadsEnabled = false;
  }
  return _auditReadsEnabled;
}

/**
 * Create an audit log entry.
 *
 * H-02: READ actions are skipped unless audit_log_reads=true in system settings.
 * Audit log failures are silently caught — they must never break the main request.
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // H-02: Skip read events unless explicitly enabled
    if (READ_ACTIONS.has(entry.action)) {
      const enabled = await isAuditReadsEnabled();
      if (!enabled) return;
    }

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        details: (entry.details ?? {}) as any,
        ipAddress: entry.ipAddress,
      },
    });
  } catch (error) {
    // Never throw — audit log failures must not break the main request path
    console.error('[audit] Failed to create audit log entry:', error);
  }
}

/**
 * Extract the client IP address from a Next.js request.
 */
export function getIpAddress(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
