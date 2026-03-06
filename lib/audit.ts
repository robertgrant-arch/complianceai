import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        details: entry.details || {},
        ipAddress: entry.ipAddress,
      },
    });
  } catch (error) {
    // Log to console but don't throw - audit log failures shouldn't break the app
    console.error('Failed to create audit log entry:', error);
  }
}

/**
 * Extract IP address from request
 */
export function getIpAddress(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

/**
 * Common audit actions
 */
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

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];
