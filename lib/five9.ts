/**
 * Five9 SOAP API Client
 * Handles authentication and call log retrieval via the Five9 VCC SOAP API
 */

import { prisma } from '@/lib/prisma';

const FIVE9_WSDL = 'https://app.five9.com/wsadmin/v12/AdminWebService?wsdl';
const FIVE9_ENDPOINT = 'https://app.five9.com/wsadmin/v12/AdminWebService';

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
   * Build SOAP envelope for a given method and body
   */
  private buildSoapEnvelope(method: string, body: string): string {
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
   * Make a SOAP request to Five9
   */
  private async soapRequest(method: string, body: string): Promise<string> {
    const envelope = this.buildSoapEnvelope(method, body);
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    const response = await fetch(`https://${this.domain}/wsadmin/v12/AdminWebService`, {
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
   * Parse XML response to extract values
   */
  private parseXmlValue(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }

  private parseXmlValues(xml: string, tag: string): string[] {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
    const values: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
      values.push(match[1].trim());
    }
    return values;
  }

  /**
   * Test connection to Five9
   */
  async testConnection(): Promise<Five9ConnectionResult> {
    if (!this.username || !this.password) {
      return { success: false, error: 'Five9 credentials not configured' };
    }

    try {
      const body = `<callCountsReportFields>
        <criteria>
          <end>${new Date().toISOString()}</end>
          <start>${new Date(Date.now() - 3600000).toISOString()}</start>
        </criteria>
      </callCountsReportFields>`;

      await this.soapRequest('getCallCountsReport', body);
      return { success: true, message: 'Connected to Five9 successfully' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get call log report from Five9 for a time range
   */
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

  /**
   * Parse call log XML response
   */
  private parseCallLogXml(xml: string): Five9Call[] {
    const calls: Five9Call[] = [];

    // Extract all <records> elements
    const recordRegex = /<records>([\s\S]*?)<\/records>/gi;
    let match;

    while ((match = recordRegex.exec(xml)) !== null) {
      const record = match[1];

      try {
        const callId = this.parseXmlValue(record, 'callId') ||
                       this.parseXmlValue(record, 'call_id') ||
                       this.parseXmlValue(record, 'CALL_ID');

        if (!callId) continue;

        const startTimeStr = this.parseXmlValue(record, 'timestamp') ||
                             this.parseXmlValue(record, 'start_time') ||
                             this.parseXmlValue(record, 'START_TIME');

        const endTimeStr = this.parseXmlValue(record, 'end_time') ||
                           this.parseXmlValue(record, 'END_TIME');

        const durationStr = this.parseXmlValue(record, 'duration') ||
                            this.parseXmlValue(record, 'DURATION') || '0';

        const call: Five9Call = {
          callId,
          agentId: this.parseXmlValue(record, 'agentId') ||
                   this.parseXmlValue(record, 'agent_id') ||
                   this.parseXmlValue(record, 'AGENT_ID') || 'unknown',
          agentName: this.parseXmlValue(record, 'agentName') ||
                     this.parseXmlValue(record, 'agent_name') ||
                     this.parseXmlValue(record, 'AGENT_NAME') || 'Unknown Agent',
          campaignName: this.parseXmlValue(record, 'campaignName') ||
                        this.parseXmlValue(record, 'campaign_name') ||
                        this.parseXmlValue(record, 'CAMPAIGN_NAME') || 'Unknown Campaign',
          callDirection: (this.parseXmlValue(record, 'type') || 'outbound').toLowerCase() as 'inbound' | 'outbound',
          startTime: startTimeStr ? new Date(startTimeStr) : new Date(),
          endTime: endTimeStr ? new Date(endTimeStr) : new Date(),
          duration: parseInt(durationStr) || 0,
          ani: this.parseXmlValue(record, 'ANI') ||
               this.parseXmlValue(record, 'ani') ||
               this.parseXmlValue(record, 'from_number') || '',
          dnis: this.parseXmlValue(record, 'DNIS') ||
                this.parseXmlValue(record, 'dnis') ||
                this.parseXmlValue(record, 'to_number') || '',
          disposition: this.parseXmlValue(record, 'disposition') ||
                       this.parseXmlValue(record, 'DISPOSITION') || '',
          recordingUrl: this.parseXmlValue(record, 'recording_url') ||
                        this.parseXmlValue(record, 'recordingUrl') || undefined,
        };

        calls.push(call);
      } catch (err) {
        console.error('Error parsing call record:', err);
      }
    }

    return calls;
  }

  /**
   * Get recording download URL for a call
   */
  async getRecordingUrl(callId: string): Promise<string | null> {
    try {
      const body = `<callId>${callId}</callId>`;
      const xml = await this.soapRequest('getCallRecordingUrl', body);
      const url = this.parseXmlValue(xml, 'return');
      return url || null;
    } catch {
      return null;
    }
  }

  /**
   * Download a recording from Five9
   */
  async downloadRecording(url: string): Promise<Buffer | null> {
    try {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const response = await fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}` },
      });

      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  /**
   * Get the last ingestion timestamp from settings
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
   * Update the last ingestion timestamp
   */
  async updateLastIngestionTime(time: Date): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key: 'five9_last_ingestion' },
      update: { value: time.toISOString() },
      create: { key: 'five9_last_ingestion', value: time.toISOString() },
    });
  }
}
