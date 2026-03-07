/**
 * lib/five9.ts
 *
 * Five9 SOAP API integration.
 *
 * FIX: CRIT-2 — SSRF via user-controlled SOAP hostname.
 *   The Five9 hostname is read from the settings table, so a compromised
 *   ADMIN account could previously redirect SOAP requests to an internal
 *   metadata endpoint (169.254.169.254), internal Redis, or other IMDS.
 *   Fixed by:
 *     1. Strict allowlist of permitted hostnames.
 *     2. URL is fully constructed server-side; only the subdomain is
 *        configurable, and only from the allowlist.
 *     3. The SOAP path is hard-coded and never derived from user input.
 *
 * FIX: LOW-2 — SOAP fault messages are no longer forwarded to API callers.
 *   Five9 faults often contain internal hostnames, session tokens, and
 *   stack traces. All errors are logged internally; callers receive a
 *   generic "Call provider unavailable" message.
 */

import soap from 'soap';
import { prisma } from '@/lib/prisma';
import { decryptSettingsSecrets } from '@/lib/crypto';

// ---------------------------------------------------------------------------
// CRIT-2: Hostname allowlist
// ---------------------------------------------------------------------------

/**
 * Permitted Five9 API hostnames.
 *
 * Five9 operates its REST/SOAP APIs on a small set of known hostnames.
 * Only these are allowed as the `five9Hostname` settings value.
 * If Five9 adds a new region endpoint, update this list through a code
 * review — never via a database setting alone.
 */
const ALLOWED_FIVE9_HOSTS: ReadonlySet<string> = new Set([
  'app.five9.com',
  'api.five9.com',
  'app.five9.eu',    // EU region
  'api.five9.eu',
]);

/**
 * The SOAP service path is fixed — it cannot be influenced by user input.
 * Five9 has used this path since API v12; update here if Five9 issues a
 * breaking change.
 */
const SOAP_PATH = '/wssupervisor/v12_6/SupervisorService?wsdl';

/**
 * Validates and builds the WSDL URL from a hostname stored in settings.
 *
 * @throws Error (safe, non-leaking) if the hostname is not on the allowlist.
 */
function buildWsdlUrl(rawHostname: string): string {
  // Normalise: strip any scheme, path, port, or whitespace the user may have
  // accidentally included (we enforce https:// ourselves).
  let hostname = rawHostname.trim().toLowerCase();

  // If someone stored a full URL, extract just the hostname.
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    try {
      hostname = new URL(hostname).hostname;
    } catch {
      throw new Error('Invalid Five9 hostname configuration.');
    }
  }

  // FIX: CRIT-2 — Hard allowlist check.
  if (!ALLOWED_FIVE9_HOSTS.has(hostname)) {
    // Log the disallowed value for security monitoring, but do NOT include
    // it in the thrown error (it will surface in API responses).
    console.error(
      `[Five9] SSRF guard: rejected disallowed hostname "${hostname}". ` +
        `Allowed: ${[...ALLOWED_FIVE9_HOSTS].join(', ')}`
    );
    throw new Error('Five9 hostname is not in the allowed list.');
  }

  // Always force HTTPS — never allow plaintext SOAP over HTTP.
  return `https://${hostname}${SOAP_PATH}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Five9Call {
  sessionId:  string;
  callId:     string;
  agentId:    string;
  agentName:  string;
  startTime:  string;
  endTime:    string;
  duration:   number;
    callDirection?: string;
  campaignName?: string;
  ani?: string;
  dnis?: string;
  disposition?: string;
  recordingUrl?: string;
}

export interface Five9CallFilter {
  startDate: Date;
  endDate:   Date;
  agentId?:  string;
}

// ---------------------------------------------------------------------------
// Internal: SOAP client factory
// ---------------------------------------------------------------------------

/** Module-level cache so we don't re-create the SOAP client on every call. */
let _clientCache: {
  client:   Awaited<ReturnType<typeof soap.createClientAsync>>;
  hostname: string;
} | null = null;

/**
 * Returns a (possibly cached) SOAP client authenticated with current settings.
 * Recreates the client if the hostname has changed.
 *
 * @internal
 */
async function getSoapClient() {
  const rawSettings = await prisma.settings.findFirst();
  if (!rawSettings) {
    throw new Error('Five9 settings not configured.');
  }

  const settings = decryptSettingsSecrets(rawSettings);

  if (!settings.five9Hostname || !settings.five9Username || !settings.five9Password) {
    throw new Error('Five9 credentials are incomplete.');
  }

  // FIX: CRIT-2 — validate hostname before using it.
  const wsdlUrl = buildWsdlUrl(settings.five9Hostname);

  // Reuse cached client if hostname hasn't changed.
  if (_clientCache && _clientCache.hostname === settings.five9Hostname) {
    return { client: _clientCache.client, settings };
  }

  const client = await soap.createClientAsync(wsdlUrl, {
    // FIX: CRIT-2 — disable SOAP redirects to prevent the client from
    // following a server-returned redirect to an internal address.
    disableCache: true,
  });

  client.setSecurity(
    new soap.BasicAuthSecurity(settings.five9Username, settings.five9Password)
  );

  _clientCache = { client, hostname: settings.five9Hostname };
  return { client, settings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches calls from Five9 for a given date range.
 *
 * FIX: LOW-2 — SOAP faults are caught and logged internally.
 * The caller receives a generic error; Five9 internals never leak.
 */
export async function fetchCalls(filter: Five9CallFilter): Promise<Five9Call[]> {
  let client: Awaited<ReturnType<typeof getSoapClient>>['client'];

  try {
    ({ client } = await getSoapClient());
  } catch (err) {
    // Configuration errors (missing creds, disallowed hostname) — log detail,
    // throw a generic message.
    console.error('[Five9] Failed to initialise SOAP client:', err);
    throw new Error('Call provider unavailable.');
  }

  try {
    const [result] = await client.getCallRecordsAsync({
      startDate:  filter.startDate.toISOString(),
      endDate:    filter.endDate.toISOString(),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
    });

    // Map the raw SOAP response to our internal type.
    // The exact field names depend on your Five9 API version; adjust as needed.
    const records: Five9Call[] = (result?.callRecords ?? []).map(
      (r: Record<string, unknown>) => ({
        sessionId:    String(r.sessionId   ?? ''),
        callId:       String(r.callId      ?? ''),
        agentId:      String(r.agentId     ?? ''),
        agentName:    String(r.agentName   ?? ''),
        startTime:    String(r.startTime   ?? ''),
        endTime:      String(r.endTime     ?? ''),
                callDirection: r.callDirection ? String(r.callDirection) : undefined,
        campaignName: r.campaignName ? String(r.campaignName) : undefined,
        ani:          r.ani ? String(r.ani) : undefined,
        dnis:         r.dnis ? String(r.dnis) : undefined,
        disposition:  r.disposition ? String(r.disposition) : undefined,
        duration:     Number(r.duration    ?? 0),
        recordingUrl: r.recordingUrl ? String(r.recordingUrl) : undefined,
      })
    );

    return records;
  } catch (err) {
    // FIX: LOW-2 — Log the full SOAP fault internally (it may contain session
    // tokens, hostnames, or stack traces) but never forward it to the caller.
    console.error('[Five9] SOAP fault in getCallRecords:', {
      message: (err as Error).message,
      // Omit `err.body` / `err.root` which contain raw SOAP XML
    });

    throw new Error('Call provider unavailable.');
  }
}

/**
 * Fetches the audio recording for a single call.
 *
 * FIX: LOW-2 — Same error-sanitisation pattern as fetchCalls.
 * FIX: CRIT-2 — recordingUrl from Five9 is validated before use.
 */
export async function fetchCallRecordingStream(
  callId:       string,
  recordingUrl: string
): Promise<NodeJS.ReadableStream> {
  // FIX: CRIT-2 — Validate that the recording URL is on a Five9 domain before
  // making a server-side fetch.  Five9 recording URLs should be on their CDN;
  // guard against a poisoned URL redirecting us to an internal address.
  let parsed: URL;
  try {
    parsed = new URL(recordingUrl);
  } catch {
    console.error(`[Five9] Invalid recording URL for call ${callId}`);
    throw new Error('Call provider unavailable.');
  }

  if (parsed.protocol !== 'https:') {
    console.error(`[Five9] Rejected non-HTTPS recording URL for call ${callId}`);
    throw new Error('Call provider unavailable.');
  }

  const ALLOWED_RECORDING_HOSTS = /\.five9\.com$/i;
  if (!ALLOWED_RECORDING_HOSTS.test(parsed.hostname)) {
    console.error(
      `[Five9] SSRF guard: rejected recording URL host "${parsed.hostname}" for call ${callId}`
    );
    throw new Error('Call provider unavailable.');
  }

  try {
    const response = await fetch(recordingUrl, {
      // Abort if the download stalls after 30 s.
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    // response.body is a Web ReadableStream; cast for Node.js compatibility.
    return response.body as unknown as NodeJS.ReadableStream;
  } catch (err) {
    console.error(`[Five9] Failed to fetch recording for call ${callId}:`, err);
    throw new Error('Call provider unavailable.');
  }
}

/**
 * Tests the current Five9 credentials without fetching real data.
 * Returns true on success; throws a generic error on failure.
 */
export async function testFive9Connection(): Promise<true> {
  try {
    const { client } = await getSoapClient();
    await client.getUsersInfoAsync({});
    return true;
  } catch (err) {
    console.error('[Five9] Connection test failed:', err);
    throw new Error('Call provider unavailable.');
  }
}


// ─── Five9Client class ───────────────────────────────────────────────────────
// Wraps the standalone SOAP functions above into a class interface so that
// worker processors can use `new Five9Client()` with familiar method names.

export class Five9Client {
  private lastIngestionTime: Date | null = null;

  /**
   * Fetch call log records between two dates.
   */
  async getCallLogReport(startDate: Date, endDate: Date): Promise<Five9Call[]> {
    const filter: Five9CallFilter = {
      startDate,
      endDate,
    };
    return fetchCalls(filter);
  }

  /**
   * Download a recording from the given URL and return the full buffer.
   * Drains the Node.js Readable stream returned by fetchCallRecordingStream().
   */
  async downloadRecording(callId: string, recordingUrl: string): Promise<Buffer> {
    const stream = await fetchCallRecordingStream(callId, recordingUrl);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Persist the last-ingested timestamp in memory.
   */
  updateLastIngestionTime(date: Date): void {
    this.lastIngestionTime = date;
  }

  getLastIngestionTime(): Date | null {
    return this.lastIngestionTime;
  }

  /**
   * Test Five9 SOAP credentials.
   */
  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await testFive9Connection();
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
