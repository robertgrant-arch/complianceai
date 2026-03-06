# Security Fix Implementation Notes

## Files in this patch

| File | Fixes |
|---|---|
| `lib/crypto.ts` | CRIT-1 — AES-256-GCM envelope encryption |
| `auth.ts` | HIGH-5 — bcrypt cost 12, account lockout |
| `next.config.js` | HIGH-4 — CSP / HSTS / security headers, LOW-1 server packages |
| `middleware.ts` | LOW-4 — static asset exclusion, MED-5 opaque redirects |
| `lib/five9.ts` | CRIT-2 — SSRF hostname allowlist, LOW-2 sanitized errors |
| `lib/auth-helpers.ts` | MED-5 — opaque 401/403 messages |
| `app/api/settings/route.ts` | CRIT-1 — credential encryption + redaction, HIGH-1 SUPER_ADMIN scope |

---

## Required: .env additions

```bash
# 32-byte hex key for AES-256-GCM credential encryption (CRIT-1)
# Generate with:  openssl rand -hex 32
SETTINGS_ENCRYPTION_KEY=<64 hex chars>
```

---

## Required: Prisma schema migration (HIGH-5)

Add these two fields to your `User` model:

```prisma
model User {
  // ... existing fields ...
  failedLoginCount  Int       @default(0)
  lockedUntil       DateTime?
}
```

Then run:

```bash
npx prisma migrate dev --name add_login_lockout_fields
```

---

## Required: One-time data migration (CRIT-1)

After deploying `lib/crypto.ts` and setting `SETTINGS_ENCRYPTION_KEY`,
run this script **once** to encrypt any existing plaintext secrets in the
`Settings` table:

```typescript
// scripts/encrypt-existing-settings.ts
import { prisma } from '../lib/prisma';
import { encryptSettingsSecrets } from '../lib/crypto';

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) { console.log('No settings row found.'); return; }

  const encrypted = encryptSettingsSecrets(settings);
  await prisma.settings.update({ where: { id: 'singleton' }, data: encrypted });
  console.log('Settings encrypted successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Run with:

```bash
npx ts-node scripts/encrypt-existing-settings.ts
```

---

## CSP tuning (HIGH-4)

After deploying `next.config.js`:

1. Check the browser console for CSP violations.
2. Wire up `/api/csp-report` (a simple POST handler that logs
   `req.json()` to your logging service) to capture violations from production.
3. Once you have a clean violation log, tighten `style-src` from
   `'unsafe-inline'` to nonce-based or hash-based CSP.

---

## Five9 hostname configuration (CRIT-2)

The allowed Five9 hostnames are hard-coded in `lib/five9.ts`:

```
app.five9.com
api.five9.com
app.five9.eu
api.five9.eu
```

If your Five9 account uses a different host (e.g., a dedicated subdomain),
add it to `ALLOWED_FIVE9_HOSTS` in `lib/five9.ts` via a code review —
**do not** make this list configurable via the database.

---

## bcrypt hash upgrade path (HIGH-5)

The new `BCRYPT_ROUNDS = 12` constant in `auth.ts` applies to **new**
password hashes only (registration, password reset). Existing users'
passwords remain at the old cost factor until they next change their password.

To force a re-hash on next login, add this to the `authorize` callback
after a successful `bcrypt.compare`:

```typescript
// Upgrade cost factor transparently on login
const currentRounds = bcrypt.getRounds(user.password);
if (currentRounds < BCRYPT_ROUNDS) {
  const newHash = await bcrypt.hash(credentials.password as string, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { password: newHash } });
}
```
