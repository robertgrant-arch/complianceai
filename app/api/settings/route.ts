/**
 * app/api/settings/route.ts
 *
 * Settings CRUD — stores Five9 credentials, OpenAI keys, Slack webhooks.
 *
 * FIX: CRIT-1 — Credentials encrypted at rest and never returned in responses.
 *   - All secret fields (five9Password, openAiKey, slackWebhookUrl) are
 *     encrypted with AES-256-GCM via lib/crypto.ts before DB writes.
 *   - GET responses replace secret fields with boolean `<field>Set` indicators.
 *   - Credential rotation is recorded in the audit log (field names only,
 *     never values).
 *
 * FIX: HIGH-1 — Settings writes require SUPER_ADMIN (not just ADMIN).
 *   An ADMIN-level user swapping the OpenAI key to one they control would
 *   allow them to read all future transcript data via OpenAI's API logs.
 *
 * FIX: MED-5 — ApiError from requireRole is opaque (see lib/auth-helpers.ts).
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole, requireAuth, ApiError } from '@/lib/auth-helpers';
import {
  encryptSettingsSecrets,
  decryptSettingsSecrets,
  redactSettingsSecrets,
} from '@/lib/crypto';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for full settings upsert (PUT).
 * All fields are optional so callers can update a subset.
 */
const SettingsUpsertSchema = z.object({
  // Five9 config
  five9Hostname:  z.string().min(1).max(253).optional(),
  five9Username:  z.string().email().optional(),
  five9Password:  z.string().min(1).max(512).optional(),

  // OpenAI config
  openAiKey: z
    .string()
    .regex(/^sk-[A-Za-z0-9\-_]{20,}$/, 'Must be a valid OpenAI API key')
    .optional(),

  // Slack config
  slackWebhookUrl: z
    .string()
    .url()
    .regex(/^https:\/\/hooks\.slack\.com\/services\//, 'Must be a Slack webhook URL')
    .optional(),
  slackChannel: z.string().max(100).optional(),

  // Notification preferences
  notifyOnScore: z.boolean().optional(),
  scoreThreshold: z.number().int().min(0).max(100).optional(),
});

/** Stable singleton row ID — settings is a single-row table. */
const SETTINGS_ID = 'singleton';

// ---------------------------------------------------------------------------
// GET — return settings (secrets redacted to boolean flags)
// ---------------------------------------------------------------------------

/**
 * FIX: CRIT-1 — GET never returns raw secret values.
 *   Callers receive `five9PasswordSet: true/false` etc., not the actual value.
 *   This means:
 *     - XSS cannot exfiltrate credentials via the settings endpoint
 *     - API access logs cannot capture secrets
 *     - Browser DevTools / network tabs show no secrets
 *
 * Requires: ADMIN or above (read-only, so ADMIN is sufficient).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole('ADMIN');
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }

  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (!settings) {
    // Return an empty redacted object — app is unconfigured.
    return Response.json(
      redactSettingsSecrets({}),
      { status: 200 }
    );
  }

  // FIX: CRIT-1 — redactSettingsSecrets strips secrets, adds *Set booleans.
  return Response.json(redactSettingsSecrets(settings), { status: 200 });
}

// ---------------------------------------------------------------------------
// PUT — upsert settings (secrets encrypted before write)
// ---------------------------------------------------------------------------

/**
 * FIX: CRIT-1 — Secrets are encrypted before being written to the database.
 * FIX: HIGH-1 — Requires SUPER_ADMIN to prevent credential-swap attacks.
 *
 * Audit log records which *fields* were changed, never their values.
 */
export async function PUT(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireRole('SUPER_ADMIN');
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }

  // ── Parse & validate input ──────────────────────────────────────────────
  let body: z.infer<typeof SettingsUpsertSchema>;
  try {
    const raw = await req.json();
    body = SettingsUpsertSchema.parse(raw);
  } catch (err) {
    return Response.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    );
  }

  if (Object.keys(body).length === 0) {
    return Response.json(
      { error: 'No fields provided.' },
      { status: 400 }
    );
  }

  // ── FIX: CRIT-1 — Encrypt secrets before DB write ──────────────────────
  const dataToWrite = encryptSettingsSecrets(body);

  // ── Upsert in a transaction with audit log ─────────────────────────────
  const changedFields = Object.keys(body);

  try {
    await prisma.$transaction([
      prisma.settings.upsert({
        where:  { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...dataToWrite },
        update: dataToWrite,
      }),
      prisma.auditLog.create({
        data: {
          userId:   session.user.id,
          action:   'SETTINGS_UPDATE',
          resource: 'settings',
          details: {
            // FIX: CRIT-1 — Log field *names* only, never values.
            fieldsChanged: changedFields,
            ip: req.headers.get('x-forwarded-for') ?? 'unknown',
          },
        },
      }),
    ]);
  } catch (err) {
    console.error('[Settings] DB upsert failed:', err);
    return Response.json(
      { error: 'Failed to save settings.' },
      { status: 500 }
    );
  }

  // Return the same redacted view as GET.
  const updated = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  return Response.json(
    redactSettingsSecrets(updated ?? {}),
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// DELETE — clear all settings (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export async function DELETE(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireRole('SUPER_ADMIN');
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }

  try {
    await prisma.$transaction([
      prisma.settings.delete({ where: { id: SETTINGS_ID } }),
      prisma.auditLog.create({
        data: {
          userId:   session.user.id,
          action:   'SETTINGS_DELETE',
          resource: 'settings',
          details:  { ip: req.headers.get('x-forwarded-for') ?? 'unknown' },
        },
      }),
    ]);
  } catch (err) {
    // settings row may not exist — treat as success.
    const isPrismaNotFound =
      typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025';

    if (!isPrismaNotFound) {
      console.error('[Settings] DELETE failed:', err);
      return Response.json({ error: 'Failed to delete settings.' }, { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
}
