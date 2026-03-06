/**
 * Five9 SOAP API Client
 * Handles authentication and call log retrieval via the Five9 VCC SOAP API
 *
 * C-04: All user-controlled values are XML-escaped before insertion into SOAP body.
 */

import { prisma } from '@/lib/prisma';

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

/**
 * C-04: Escape special XML characters to prevent injection.
 * Applied to every user-controlled or external value before SOAP body insertion.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class Five9Client {
  private username: string;
  private password: string;
  private domain: string;

  constructor() {
    this.username = process.env.FIVE9_USERNAME || '';
    this.password = process.env.FIVE9_PASSWORD || '';
    this.domain = process.env.FIVE9_DOMAIN || 'app.five9.com';
  }

  /**
   * Build SOAP envelope for a given method and body.
   * The method name is validated against an allowlist to prevent injection.
   */
  private buildSoapEnvelope(method: string, body: string): string {
    // Allowlist of valid SOAP method names — prevents method-name injection
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

  /**
   * Make a SOAP request to Five9.
   * C-04: Credentials are sent via Authorization header, never interpolated into XML.
   */
  private async soapRequest(method: string, body: string): Promise<string> {
    const envelope = this.buildSoapEnvelope(method, body);
    // C-04: Credentials are Base64-encoded and sent in the HTTP Authorization header,
    // never interpolated into the XML body where they could break the SOAP structure.
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    // C-04: domain is validated to be a simple hostname (no path traversal)
    const safeDomain = this.domain.replace(/[^a-zA-Z0-9.\-]/g, '');
    const response = await fetch(`https://${safeDomain}/wsadmin/v12/AdminWebService`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"${method}"`,
        'Authorization': `Basic ${credentials}`,
      },
      body: envelope,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Five9 SOAP error ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.text();
  }

  /**
   * Parse XML response to extract a single value by tag name.
   */
  private parseXmlValue(xml: string, tag: string): string {
    const safeTag = tag.replace(/[^a-zA-Z0-9_\-]/g, '');
    const regex = new RegExp(`<${safeTag}[^>]*>([^<]*)</${safeTag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }

  private parseXmlValues(xml: string, tag: string): string[] {
    const safeTag = tag.replace(/[^a-zA-Z0-9_\-]/g, '');
    const regex = new RegExp(`<${safeTag}[^>]*>([^<]*)</${safeTag}>`, 'gi');
    const values: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
      values.push(match[1].trim());
    }
    return values;
  }

  /**
   * Test connection to Five9.
   * C-04: Date values are ISO strings (safe, no user input).
   */
  async testConnection(): Promise<Five9ConnectionResult> {
    if (!this.username || !this.password) {
      return { success: false, error: 'Five9 credentials not configured' };
    }

    try {
      // ISO date strings are safe — they only contain digits, dashes, colons, and 'T'/'Z'
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

  /**
   * Get call log report from Five9 for a time range.
   * C-04: Date values are ISO strings — safe to embed without escaping.
   */
  async getCallLogReport(startTime: Date, endTime: Date): Promise<Five9Call[]> {
    // ISO date strings only contain [0-9T:Z.+-] — no XML injection risk
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

  /**
   * Parse call log XML response.
   */
  private parseCallLogXml(xml: string): Five9Call[] {
    const calls: Five9Call[] = [];
    const recordRegex = /<records>([\s\S]*?)<\/records>/gi;
    let match;

    while ((match = recordRegex.exec(xml)) !== null) {
      const record = match[1];

      try {
        const callId =
          this.parseXmlValue(record, 'callId') ||
          this.parseXmlValue(record, 'call_id') ||
          this.parseXmlValue(record, 'CALL_ID');

        if (!callId) continue;

        const startTimeStr =
          this.parseXmlValue(record, 'timestamp') ||
          this.parseXmlValue(record, 'start_time') ||
          this.parseXmlValue(record, 'START_TIME');

        const endTimeStr =
          this.parseXmlValue(record, 'end_time') ||
          this.parseXmlValue(record, 'END_TIME');

        const durationStr =
          this.parseXmlValue(record, 'duration') ||
          this.parseXmlValue(record, 'DURATION') ||
          '0';

        const call: Five9Call = {
          callId,
          agentId:
            this.parseXmlValue(record, 'agentId') ||
            this.parseXmlValue(record, 'agent_id') ||
            this.parseXmlValue(record, 'AGENT_ID') ||
            'unknown',
          agentName:
            this.parseXmlValue(record, 'agentName') ||
            this.parseXmlValue(record, 'agent_name') ||
            this.parseXmlValue(record, 'AGENT_NAME') ||
            'Unknown Agent',
          campaignName:
            this.parseXmlValue(record, 'campaignName') ||
            this.parseXmlValue(record, 'campaign_name') ||
            this.parseXmlValue(record, 'CAMPAIGN_NAME') ||
            'Unknown Campaign',
          callDirection: (
            this.parseXmlValue(record, 'type') || 'outbound'
          ).toLowerCase() as 'inbound' | 'outbound',
          startTime: startTimeStr ? new Date(startTimeStr) : new Date(),
          endTime: endTimeStr ? new Date(endTimeStr) : new Date(),
          duration: parseInt(durationStr) || 0,
          ani:
            this.parseXmlValue(record, 'ANI') ||
            this.parseXmlValue(record, 'ani') ||
            this.parseXmlValue(record, 'from_number') ||
            '',
          dnis:
            this.parseXmlValue(record, 'DNIS') ||
            this.parseXmlValue(record, 'dnis') ||
            this.parseXmlValue(record, 'to_number') ||
            '',
          disposition:
            this.parseXmlValue(record, 'disposition') ||
            this.parseXmlValue(record, 'DISPOSITION') ||
            '',
          recordingUrl:
            this.parseXmlValue(record, 'recording_url') ||
            this.parseXmlValue(record, 'recordingUrl') ||
            undefined,
        };

        calls.push(call);
      } catch (err) {
        console.error('Error parsing call record:', err);
      }
    }

    return calls;
  }

  /**
   * Get recording download URL for a call.
   * C-04: callId is escaped before embedding in XML body.
   */
  async getRecordingUrl(callId: string): Promise<string | null> {
    try {
      // C-04: escape the callId in case it contains special chars
      const body = `<callId>${escapeXml(callId)}</callId>`;
      const xml = await this.soapRequest('getCallRecordingUrl', body);
      const url = this.parseXmlValue(xml, 'return');
      return url || null;
    } catch {
      return null;
    }
  }

  /**
   * Download a recording from Five9.
   * Credentials are sent via Authorization header — never in the URL.
   */
  async downloadRecording(url: string): Promise<Buffer | null> {
    try {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  /**
   * Get the last ingestion timestamp from settings.
   */
  async getLastIngestionTime(): Promise<Date> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'five9_last_ingestion' },
    });

    if (setting?.value) {
      return new Date(setting.value);
    }

    // Default: last 24 hours
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  /**
   * Update the last ingestion timestamp.
   */
  async updateLastIngestionTime(time: Date): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key: 'five9_last_ingestion' },
      update: { value: time.toISOString() },
      create: { key: 'five9_last_ingestion', value: time.toISOString() },
    });
  }
}
