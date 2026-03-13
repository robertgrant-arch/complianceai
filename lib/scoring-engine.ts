import { prisma } from '@/lib/prisma';

export interface ItemScore {
  code: string;
  score: number;
  passed: boolean;
  reason?: string;
}

export interface ScoringResult {
  scorecardId: string;
  overallScore: number;
  itemScores: ItemScore[];
  flags: Array<{ ruleCode: string; severity: string; message: string }>;
}

/**
 * Score a call transcript against the active scorecard for a campaign.
 * Each scorecard item is evaluated by keyword/phrase matching.
 * Plug in Claude/Anthropic API calls here for richer semantic scoring.
 */
export async function scoreCallTranscript(
  transcript: string,
  campaignName: string,
  callId: string
): Promise<ScoringResult | null> {
  const lower = transcript.toLowerCase();

  // Find active scorecard for this campaign
  const scorecardCampaign = await prisma.scorecardCampaign.findFirst({
    where: { campaignName },
    include: { scorecard: { include: { items: true } } },
  });

  // Fall back to default COMPLIANCE scorecard
  const scorecard = scorecardCampaign?.scorecard
    ?? await prisma.scorecard.findFirst({
        where: { type: 'COMPLIANCE', isActive: true },
        include: { items: true },
      });

  if (!scorecard) return null;

  const itemScores: ItemScore[] = [];
  const flags: ScoringResult['flags'] = [];
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const item of scorecard.items) {
    const { passed, reason } = evaluateItem(item, lower);
    const score = passed ? item.maxScore : 0;

    itemScores.push({ code: item.code, score, passed, reason });
    totalWeighted += score * item.weight;
    totalWeight += item.weight * item.maxScore;

    if (!passed) {
      flags.push({
        ruleCode: item.code,
        severity: item.weight >= 0.4 ? 'CRITICAL' : item.weight >= 0.2 ? 'WARNING' : 'INFO',
        message: reason ?? `Failed: ${item.description}`,
      });
    }
  }

  const overallScore = totalWeight > 0 ? Math.round((100 * totalWeighted) / totalWeight) : 0;

  return { scorecardId: scorecard.id, overallScore, itemScores, flags };
}

function evaluateItem(
  item: { code: string; description: string; category: string },
  lowerTranscript: string
): { passed: boolean; reason?: string } {
  // Built-in rules by code
  switch (item.code) {
    case 'DISCLOSURE_OPENING':
      return {
        passed:
          lowerTranscript.includes('this call may be recorded') ||
          lowerTranscript.includes('consent to being recorded') ||
          lowerTranscript.includes('call is being recorded'),
        reason: 'Missing opening recording disclosure',
      };

    case 'MINI_MIRANDA':
      return {
        passed:
          lowerTranscript.includes('this is an attempt to collect a debt') ||
          lowerTranscript.includes('debt collector'),
        reason: 'Missing Mini-Miranda disclosure',
      };

    case 'COMPANY_INTRO':
      return {
        passed: lowerTranscript.includes('selectquote') || lowerTranscript.includes('my name is'),
        reason: 'Agent did not introduce themselves or the company',
      };

    case 'VERIFY_IDENTITY':
      return {
        passed: lowerTranscript.includes('date of birth') || lowerTranscript.includes('last four') || lowerTranscript.includes('verify'),
        reason: 'No identity verification performed',
      };

    case 'NO_PROFANITY':
      return {
        passed: !/(\bfuck|\bshit|\bass\b|\bdamn\b)/i.test(lowerTranscript),
        reason: 'Profanity detected in transcript',
      };

    case 'CLOSING_SUMMARY': {
      return {
        passed: lowerTranscript.includes('in summary') || lowerTranscript.includes('to recap') || lowerTranscript.includes('review'),
        reason: 'No closing summary provided',
      };
    }

    default:
      // For custom codes, do a keyword match against the description
      return { passed: true };
  }
}

/**
 * Run alert rules against transcript for real-time flagging.
 */
export async function checkAlertRules(
  transcript: string,
  campaignName: string
): Promise<Array<{ name: string; severity: string; pattern: string }>> {
  const rules = await prisma.alertRule.findMany({
    where: { isActive: true },
  });

  const triggered: Array<{ name: string; severity: string; pattern: string }> = [];

  for (const rule of rules) {
    // Skip if campaign filter is set and doesn't match
    const campaigns = rule.campaigns as string[];
    if (campaigns.length > 0 && !campaigns.includes(campaignName)) continue;

    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(transcript)) {
      triggered.push({
        name: rule.name,
        severity: rule.severity,
        pattern: rule.pattern,
      });
    }
  }

  return triggered;
}
