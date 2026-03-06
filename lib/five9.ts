/**
 * Five9 SOAP API Client
 *
 * Security hardening:
 *   Fix-1 (SSRF):    Domain validated against strict allowlist /^[a-zA-Z0-9-]+\.five9\.com$/.
 *                    Any non-matching value throws immediately — no request is made.
 *   Fix-2 (ReDoS):   All XML parsing uses fast-xml-parser (no regex on untrusted XML).
 *                    Response body is capped at 5 MB before parsing.
 *   Fix-3 (Secret):  Authorization header is never logged. redactHeaders() helper
 *                    strips it from any object before it reaches a logger.
 *   C-04 (Injection):All user-controlled values are XML-escaped before SOAP body insertion.
 */

import { XMLParser } from 'fast-xml-parser';
import { prisma } from '@/lib/prisma';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum response body size accepted from Five9 (5 MB). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Fix-1 (SSRF): Only hostnames matching this pattern are allowed.
 * Accepts e.g. "app.five9.com", "api.five9.com", "eu1.five9.com".
 * Rejects IPs, localhost, other domains, and path-traversal attempts.
 */
const FIVE9_DOMAIN_ALLOWLIST = /^[a-zA-Z0-9-]+\.five9\.com$/;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Five9Call {
  callId: string;
  agentId: string;
  agentName: string;
  campaignName: string;
  callDirection: 'inbound' | 'outbound';
  startTime: Date;
  endTime: Date;
  duration: number;
  ani: string;
  dnis: string;
  disposition: string;
  recordingUrl?: string;
}

export interface Five9ConnectionResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * C-04: Escape special XML characters to prevent SOAP injection.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fix-3 (Secret Exposure): Returns a shallow copy of a headers object with
 * the Authorization value replaced by "[REDACTED]".
 * Use this before passing headers to any logger or error reporter.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const safe = { ...headers };
  if (safe['Authorization']) safe['Authorization'] = '[REDACTED]';
  return safe;
}

/**
 * Fix-2 (ReDoS): Shared fast-xml-parser instance.
 * Configured to parse values as strings and treat records/return as arrays.
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: true,
  trimValues: true,
  isArray: (tagName) =>
    tagName === 'records' || tagName === 'return' || tagName === 'userInfo',
});

// ─── Five9Client ──────────────────────────────────────────────────────────────

export class Five9Client {
  private readonly username: string;
  private readonly password: string;
  private readonly domain: string;

  constructor() {
    this.username = process.env.FIVE9_USERNAME || '';
    this.password = process.env.FIVE9_PASSWORD || '';
    const rawDomain = process.env.FIVE9_DOMAIN || 'app.five9.com';

    // Fix-1 (SSRF): Validate domain against strict allowlist at construction time.
    if (!FIVE9_DOMAIN_ALLOWLIST.test(rawDomain)) {
      throw new Error(
        `Invalid FIVE9_DOMAIN "${rawDomain}": must match /^[a-zA-Z0-9-]+\\.five9\\.com$/`
      );
    }
    this.domain = rawDomain;
  }

  // ─── Private: SOAP envelope builder ─────────────────────────────────────────

  private buildSoapEnvelope(method: string, body: string): string {
    const ALLOWED_METHODS = new Set([
      'getCallLogReport',
      'getCallCountsReport',
      'getCallRecordingUrl',
      'getUsersInfo',
    ]);
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`Disallowed SOAP method: ${method}`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.admin.ws.five9.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${method}>
      ${body}
    </ser:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  // ─── Private: SOAP request ───────────────────────────────────────────────────

  /**
   * Fix-1: domain pre-validated in constructor.
   * Fix-2: response body capped at MAX_RESPONSE_BYTES before any parsing.
   * Fix-3: Authorization header never passed to any logger.
   * C-04:  Credentials sent via Authorization header, never in XML body.
   */
  private async soapRequest(method: string, body: string): Promise<string> {
    const envelope = this.buildSoapEnvelope(method, body);
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    let response: Response;
    try {
      response = await fetch(`https://${this.domain}/wsadmin/v12/AdminWebService`, {
        method: 'POST',
        // Fix-3: headers object is local — never passed to console.error or logger
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `"${method}"`,
          'Authorization': `Basic ${credentials}`,
        },
        body: envelope,
      });
    } catch (networkErr: any) {
      // Fix-3: log only method name and error message — no headers
      console.error(`[Five9] Network error calling ${method}:`, networkErr.message);
      throw networkErr;
    }

    if (!response.ok) {
      // Fix-2: cap error body at 1 KB
      const errText = (await response.text()).slice(0, 1024);
      // Fix-3: log only status and method, never headers
      console.error(`[Five9] SOAP error ${response.status} for "${method}": ${errText}`);
      throw new Error(`Five9 SOAP error ${response.status}: ${errText}`);
    }

    // Fix-2: check Content-Length header first (fast path)
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error(
        `Five9 response too large: ${contentLength} bytes (max ${MAX_RESPONSE_BYTES})`
      );
    }

    // Fix-2: read as ArrayBuffer to check actual byte length before decoding
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(
        `Five9 response body too large: ${buffer.byteLength} bytes (max ${MAX_RESPONSE_BYTES})`
      );
    }

    return new TextDecoder().decode(buffer);
  }

  // ─── Private: XML parsing (Fix-2: fast-xml-parser, no regex on XML) ─────────

  /**
   * Fix-2: Parse the full SOAP response with fast-xml-parser and extract
   * a value by tag name. Falls back to '' on missing keys or parse errors.
   */
  private parseXmlValue(xml: string, tag: string): string {
    try {
      const parsed = xmlParser.parse(xml);
      return this.findValueByTag(parsed, tag.toLowerCase()) ?? '';
    } catch {
      return '';
    }
  }

  /** Recursively search a parsed XML object for the first value matching `tag`. */
  private findValueByTag(obj: any, tag: string): string | undefined {
    if (obj === null || obj === undefined || typeof obj !== 'object') return undefined;
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === tag) {
        const val = obj[key];
        if (typeof val === 'string') return val;
        if (typeof val === 'number') return String(val);
        if (Array.isArray(val) && val.length > 0) return String(val[0]);
      }
      const nested = this.findValueByTag(obj[key], tag);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  /**
   * Fix-2: Parse the call log XML response using fast-xml-parser.
   * Replaces the previous regex-based parseCallLogXml / parseXmlValues approach.
   */
  private parseCallLogXml(xml: string): Five9Call[] {
    let parsed: any;
    try {
      parsed = xmlParser.parse(xml);
    } catch (err) {
      console.error('[Five9] Failed to parse call log XML:', (err as Error).message);
      return [];
    }

    const records: any[] = this.extractArray(parsed, 'records');
    const calls: Five9Call[] = [];

    for (const record of records) {
      try {
        const callId =
          this.getField(record, 'callId') ||
          this.getField(record, 'call_id') ||
          this.getField(record, 'CALL_ID');
        if (!callId) continue;

        const startTimeStr =
          this.getField(record, 'timestamp') ||
          this.getField(record, 'start_time') ||
          this.getField(record, 'START_TIME');
        const endTimeStr =
          this.getField(record, 'end_time') ||
          this.getField(record, 'END_TIME');
        const durationStr =
          this.getField(record, 'duration') ||
          this.getField(record, 'DURATION') ||
          '0';

        calls.push({
          callId,
          agentId:
            this.getField(record, 'agentId') ||
            this.getField(record, 'agent_id') ||
            this.getField(record, 'AGENT_ID') ||
            'unknown',
          agentName:
            this.getField(record, 'agentName') ||
            this.getField(record, 'agent_name') ||
            this.getField(record, 'AGENT_NAME') ||
            'Unknown Agent',
          campaignName:
            this.getField(record, 'campaignName') ||
            this.getField(record, 'campaign_name') ||
            this.getField(record, 'CAMPAIGN_NAME') ||
            'Unknown Campaign',
          callDirection: (
            this.getField(record, 'type') || 'outbound'
          ).toLowerCase() as 'inbound' | 'outbound',
          startTime: startTimeStr ? new Date(startTimeStr) : new Date(),
          endTime: endTimeStr ? new Date(endTimeStr) : new Date(),
          duration: parseInt(durationStr) || 0,
          ani:
            this.getField(record, 'ANI') ||
            this.getField(record, 'ani') ||
            this.getField(record, 'from_number') ||
            '',
          dnis:
            this.getField(record, 'DNIS') ||
            this.getField(record, 'dnis') ||
            this.getField(record, 'to_number') ||
            '',
          disposition:
            this.getField(record, 'disposition') ||
            this.getField(record, 'DISPOSITION') ||
            '',
          recordingUrl:
            this.getField(record, 'recording_url') ||
            this.getField(record, 'recordingUrl') ||
            undefined,
        });
      } catch (err) {
        console.error('[Five9] Error parsing call record:', (err as Error).message);
      }
    }
    return calls;
  }

  /** Safely get a string field from a parsed record object. */
  private getField(record: any, key: string): string {
    if (!record || typeof record !== 'object') return '';
    const val = record[key];
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    return '';
  }

  /** Walk a parsed XML object and collect all items under any key matching `arrayTag`. */
  private extractArray(obj: any, arrayTag: string): any[] {
    if (!obj || typeof obj !== 'object') return [];
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === arrayTag) {
        const val = obj[key];
        return Array.isArray(val) ? val : [val];
      }
      const nested = this.extractArray(obj[key], arrayTag);
      if (nested.length > 0) return nested;
    }
    return [];
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async testConnection(): Promise<Five9ConnectionResult> {
    if (!this.username || !this.password) {
      return { success: false, error: 'Five9 credentials not configured' };
    }
    try {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const body = `<callCountsReportFields>
        <criteria>
          <end>${now}</end>
          <start>${oneHourAgo}</start>
        </criteria>
      </callCountsReportFields>`;
      await this.soapRequest('getCallCountsReport', body);
      return { success: true, message: 'Connected to Five9 successfully' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getCallLogReport(startTime: Date, endTime: Date): Promise<Five9Call[]> {
    const body = `<callLogReportFields>
      <criteria>
        <end>${endTime.toISOString()}</end>
        <start>${startTime.toISOString()}</start>
        <reportType>AGENT</reportType>
      </criteria>
    </callLogReportFields>`;
    const xml = await this.soapRequest('getCallLogReport', body);
    return this.parseCallLogXml(xml);
  }

  async getRecordingUrl(callId: string): Promise<string | null> {
    try {
      const body = `<callId>${escapeXml(callId)}</callId>`;
      const xml = await this.soapRequest('getCallRecordingUrl', body);
      return this.parseXmlValue(xml, 'return') || null;
    } catch {
      return null;
    }
  }

  async downloadRecording(url: string): Promise<Buffer | null> {
    try {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const response = await fetch(url, {
        // Fix-3: credentials in header, never logged
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (!response.ok) {
        console.error(`[Five9] Recording download failed: HTTP ${response.status}`);
        return null;
      }
      // Fix-2: cap recording size
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        console.error(`[Five9] Recording too large: ${buffer.byteLength} bytes`);
        return null;
      }
      return Buffer.from(buffer);
    } catch (err: any) {
      // Fix-3: log only the error message, not request headers
      console.error('[Five9] downloadRecording error:', err.message);
      return null;
    }
  }

  async getLastIngestionTime(): Promise<Date> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'five9_last_ingestion' },
    });
    if (setting?.value) return new Date(setting.value);
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  async updateLastIngestionTime(time: Date): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key: 'five9_last_ingestion' },
      update: { value: time.toISOString() },
      create: { key: 'five9_last_ingestion', value: time.toISOString() },
    });
  }
}
