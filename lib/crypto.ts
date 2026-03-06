/**
 * lib/crypto.ts
 *
 * AES-256-GCM envelope encryption for secrets stored in the database
 * (Five9 credentials, OpenAI keys, Slack webhooks).
 *
 * FIX: CRIT-1 — Credentials stored/returned as plaintext
 *
 * Setup:
 *   openssl rand -hex 32   → paste result as SETTINGS_ENCRYPTION_KEY in .env
 *
 * Wire format stored in DB:
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * All three segments are authenticated by GCM — any tampering causes
 * decryption to throw, protecting against chosen-ciphertext attacks.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12;   // 96-bit IV — optimal for GCM
const TAG_BYTES = 16;  // 128-bit authentication tag — GCM default, do not reduce
const SENTINEL = 'enc:v1:'; // prefix so we can detect & skip already-encrypted values

// ---------------------------------------------------------------------------
// Key loading (fail fast at import time, not at request time)
// ---------------------------------------------------------------------------
function loadKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      '[crypto] SETTINGS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('[crypto] SETTINGS_ENCRYPTION_KEY decoded to wrong length.');
  }
  return key;
}

// Lazy-load so unit tests can set process.env before importing.
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = loadKey();
  return _key;
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext secret string.
 * Returns an opaque `enc:v1:<iv>:<tag>:<ciphertext>` string safe for DB storage.
 *
 * Calling with an already-encrypted value is a no-op (idempotent).
 */
export function encryptSecret(plain: string): string {
  if (plain.startsWith(SENTINEL)) {
    // Already encrypted — do not double-encrypt during migrations / re-saves
    return plain;
  }

  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  if (tag.length !== TAG_BYTES) {
    throw new Error('[crypto] Unexpected GCM auth tag length.');
  }

  return (
    SENTINEL +
    iv.toString('hex') +
    ':' +
    tag.toString('hex') +
    ':' +
    encrypted.toString('hex')
  );
}

/**
 * Decrypts a value previously produced by `encryptSecret`.
 * Throws if the value has been tampered with or is malformed.
 *
 * Calling with a plaintext value (legacy, pre-encryption migration) returns
 * the value unchanged — remove this fallback once migration is complete.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(SENTINEL)) {
    // ⚠ Legacy plaintext value — log a warning during migration period.
    // TODO: remove this branch once all rows are encrypted.
    console.warn(
      '[crypto] decryptSecret: found unencrypted value in database. ' +
        'Run the migration script to encrypt all settings.'
    );
    return stored;
  }

  const payload = stored.slice(SENTINEL.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('[crypto] Malformed encrypted value: unexpected segment count.');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();

  let iv: Buffer, tag: Buffer, ciphertext: Buffer;
  try {
    iv = Buffer.from(ivHex, 'hex');
    tag = Buffer.from(tagHex, 'hex');
    ciphertext = Buffer.from(ciphertextHex, 'hex');
  } catch {
    throw new Error('[crypto] Malformed encrypted value: hex decode failed.');
  }

  if (iv.length !== IV_BYTES) {
    throw new Error('[crypto] Malformed encrypted value: bad IV length.');
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('[crypto] Malformed encrypted value: bad auth tag length.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(), // throws here if tag verification fails
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Do NOT propagate the internal error — it may contain timing information.
    throw new Error('[crypto] Decryption failed: authentication tag mismatch or corrupted data.');
  }
}

/**
 * Returns true if the value is already encrypted with our scheme.
 * Use to guard against double-encryption in upsert flows.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(SENTINEL);
}

// ---------------------------------------------------------------------------
// Batch helpers for settings objects
// ---------------------------------------------------------------------------

type SecretFields = 'five9Password' | 'openAiKey' | 'slackWebhookUrl';

type SettingsWithSecrets = Partial<Record<SecretFields, string | null>> &
  Record<string, unknown>;

/**
 * Encrypts all known secret fields on a settings object before DB write.
 * Non-secret fields and null values are passed through unchanged.
 */
export function encryptSettingsSecrets<T extends SettingsWithSecrets>(
  settings: T
): T {
  const SECRET_KEYS: SecretFields[] = ['five9Password', 'openAiKey', 'slackWebhookUrl'];
  const result = { ...settings };
  for (const field of SECRET_KEYS) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[field] = encryptSecret(value);
    }
  }
  return result;
}

/**
 * Decrypts all known secret fields on a settings object after DB read.
 * Use only server-side — never include decrypted secrets in API responses.
 */
export function decryptSettingsSecrets<T extends SettingsWithSecrets>(
  settings: T
): T {
  const SECRET_KEYS: SecretFields[] = ['five9Password', 'openAiKey', 'slackWebhookUrl'];
  const result = { ...settings };
  for (const field of SECRET_KEYS) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[field] = decryptSecret(value);
    }
  }
  return result;
}

/**
 * Produces a redacted view of a settings object safe for API responses.
 * Secret fields are replaced with a boolean `<fieldName>Set` indicator.
 *
 * Usage:
 *   return Response.json(redactSettingsSecrets(settings));
 */
export function redactSettingsSecrets(
  settings: SettingsWithSecrets & { five9Username?: string | null }
): Record<string, unknown> {
  const { five9Password, openAiKey, slackWebhookUrl, ...rest } = settings;
  return {
    ...rest,
    five9PasswordSet: typeof five9Password === 'string' && five9Password.length > 0,
    openAiKeySet: typeof openAiKey === 'string' && openAiKey.length > 0,
    slackWebhookUrlSet: typeof slackWebhookUrl === 'string' && slackWebhookUrl.length > 0,
  };
}
