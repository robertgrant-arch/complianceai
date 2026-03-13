import { prisma } from '@/lib/prisma';

export interface Violation {
  code: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

// Timezone quiet hours: 8am-9pm local time (TCPA)
const QUIET_HOURS_START = 8;
const QUIET_HOURS_END = 21;

// State-to-timezone map (abbreviated — expand as needed)
const STATE_TZ: Record<string, string> = {
  CA: 'America/Los_Angeles',
  NY: 'America/New_York',
  TX: 'America/Chicago',
  FL: 'America/New_York',
  IL: 'America/Chicago',
  AZ: 'America/Phoenix',
  CO: 'America/Denver',
  WA: 'America/Los_Angeles',
  OR: 'America/Los_Angeles',
  NV: 'America/Los_Angeles',
  MT: 'America/Denver',
  ID: 'America/Denver',
  WY: 'America/Denver',
  UT: 'America/Denver',
  NM: 'America/Denver',
  ND: 'America/Chicago',
  SD: 'America/Chicago',
  NE: 'America/Chicago',
  KS: 'America/Chicago',
  MN: 'America/Chicago',
  IA: 'America/Chicago',
  MO: 'America/Chicago',
  WI: 'America/Chicago',
  MI: 'America/Detroit',
  IN: 'America/Indiana/Indianapolis',
  OH: 'America/New_York',
  KY: 'America/New_York',
  TN: 'America/Chicago',
  AL: 'America/Chicago',
  MS: 'America/Chicago',
  AR: 'America/Chicago',
  LA: 'America/Chicago',
  OK: 'America/Chicago',
  GA: 'America/New_York',
  SC: 'America/New_York',
  NC: 'America/New_York',
  VA: 'America/New_York',
  WV: 'America/New_York',
  MD: 'America/New_York',
  DE: 'America/New_York',
  PA: 'America/New_York',
  NJ: 'America/New_York',
  CT: 'America/New_York',
  RI: 'America/New_York',
  MA: 'America/New_York',
  VT: 'America/New_York',
  NH: 'America/New_York',
  ME: 'America/New_York',
  HI: 'Pacific/Honolulu',
  AK: 'America/Anchorage',
};

export async function checkDnc({ phone }: { phone: string }): Promise<Violation[]> {
  const entry = await prisma.dncEntry.findUnique({ where: { phone } });
  if (entry) {
    return [{
      code: 'DNC_HIT',
      message: `Number ${phone} is on the Do Not Call list (source: ${entry.source})`,
      severity: 'CRITICAL',
    }];
  }
  return [];
}

export async function checkTimezone({
  phone,
  state,
}: {
  phone: string;
  state?: string;
}): Promise<Violation[]> {
  if (!state) return [];

  const tz = STATE_TZ[state.toUpperCase()];
  if (!tz) return [];

  const now = new Date();
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(now)
  );

  if (localHour < QUIET_HOURS_START || localHour >= QUIET_HOURS_END) {
    return [{
      code: 'QUIET_HOURS',
      message: `Call outside TCPA quiet hours for state ${state} (local hour: ${localHour})`,
      severity: 'CRITICAL',
    }];
  }
  return [];
}

export async function checkFrequency({
  phone,
  campaignId,
  lastContactedAt,
  maxCallsPerDay = 3,
  minIntervalHours = 1,
}: {
  phone: string;
  campaignId: string;
  lastContactedAt?: string;
  maxCallsPerDay?: number;
  minIntervalHours?: number;
}): Promise<Violation[]> {
  const violations: Violation[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const callsToday = await prisma.preDialCheck.count({
    where: {
      phone,
      campaignId,
      allowed: true,
      checkedAt: { gte: today },
    },
  });

  if (callsToday >= maxCallsPerDay) {
    violations.push({
      code: 'CALL_FREQUENCY_EXCEEDED',
      message: `Phone ${phone} has already been contacted ${callsToday} times today for campaign ${campaignId}`,
      severity: 'HIGH',
    });
  }

  if (lastContactedAt) {
    const lastContact = new Date(lastContactedAt);
    const hoursSince = (Date.now() - lastContact.getTime()) / 3_600_000;
    if (hoursSince < minIntervalHours) {
      violations.push({
        code: 'MIN_INTERVAL_VIOLATION',
        message: `Minimum ${minIntervalHours}h between calls not met (last contact ${hoursSince.toFixed(1)}h ago)`,
        severity: 'MEDIUM',
      });
    }
  }

  return violations;
}

export async function checkConsent({
  phone,
  campaignId,
  state,
  consentFlags,
}: {
  phone: string;
  campaignId?: string;
  state?: string;
  consentFlags?: Record<string, boolean>;
}): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Check for existing consent record
  const consent = await prisma.consentEvent.findFirst({
    where: { phone, consentGiven: true },
    orderBy: { recordedAt: 'desc' },
  });

  if (!consent && !consentFlags?.tcpaConsent) {
    violations.push({
      code: 'MISSING_TCPA_CONSENT',
      message: `No TCPA consent on file for ${phone}`,
      severity: 'CRITICAL',
    });
  }

  return violations;
}

// Helper: run all checks in one call
export async function runAllPreDialChecks(input: {
  phone: string;
  campaignId: string;
  agentId?: string;
  state?: string;
  lastContactedAt?: string;
  consentFlags?: Record<string, boolean>;
}): Promise<{ allowed: boolean; violations: Violation[] }> {
  const violations: Violation[] = [
    ...(await checkDnc({ phone: input.phone })),
    ...(await checkTimezone({ phone: input.phone, state: input.state })),
    ...(await checkFrequency({ phone: input.phone, campaignId: input.campaignId, lastContactedAt: input.lastContactedAt })),
    ...(await checkConsent({ phone: input.phone, campaignId: input.campaignId, state: input.state, consentFlags: input.consentFlags })),
  ];

  return { allowed: violations.filter(v => v.severity === 'CRITICAL').length === 0, violations };
}
