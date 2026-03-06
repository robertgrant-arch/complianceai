import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import type { NotificationJobData } from '../queues';

export async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { type, callId, agentName, score, flagCount, error } = job.data;

  // Get notification settings
  const settings = await getNotificationSettings();

  const callUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/calls/${callId}`;

  switch (type) {
    case 'critical_flag':
      if (settings.notify_critical_flags) {
        const message = buildCriticalFlagMessage(agentName, score, flagCount, callUrl);
        await sendNotification(settings, message, 'CRITICAL FLAG');
      }
      break;

    case 'low_score':
      if (settings.notify_low_scores) {
        const message = buildLowScoreMessage(agentName, score, callUrl);
        await sendNotification(settings, message, 'LOW COMPLIANCE SCORE');
      }
      break;

    case 'processing_error':
      if (settings.notify_errors) {
        const message = buildErrorMessage(agentName, error, callUrl);
        await sendNotification(settings, message, 'PROCESSING ERROR');
      }
      break;
  }
}

async function getNotificationSettings(): Promise<Record<string, any>> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'slack_webhook_url',
          'alert_email',
          'notify_critical_flags',
          'notify_low_scores',
          'notify_errors',
          'critical_score_threshold',
        ],
      },
    },
  });

  return settings.reduce((acc, s) => {
    try {
      acc[s.key] = JSON.parse(s.value);
    } catch {
      acc[s.key] = s.value;
    }
    return acc;
  }, {} as Record<string, any>);
}

async function sendNotification(
  settings: Record<string, any>,
  message: string,
  subject: string
): Promise<void> {
  const promises: Promise<void>[] = [];

  // Send Slack notification
  if (settings.slack_webhook_url) {
    promises.push(sendSlackNotification(settings.slack_webhook_url, message, subject));
  }

  // Send email notification (using simple SMTP or SendGrid)
  if (settings.alert_email) {
    promises.push(sendEmailNotification(settings.alert_email, subject, message));
  }

  await Promise.allSettled(promises);
}

async function sendSlackNotification(
  webhookUrl: string,
  message: string,
  subject: string
): Promise<void> {
  const payload = {
    text: `*ComplianceAI Alert: ${subject}*`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 ComplianceAI: ${subject}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent at ${new Date().toLocaleString()}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status}`);
  }
}

async function sendEmailNotification(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  // Use SendGrid if configured, otherwise log
  const sendgridKey = process.env.SENDGRID_API_KEY;

  if (!sendgridKey) {
    console.log(`[Email] Would send to ${to}: ${subject}\n${body}`);
    return;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendgridKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.FROM_EMAIL || 'noreply@complianceai.com', name: 'ComplianceAI' },
      subject: `[ComplianceAI] ${subject}`,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SendGrid error: ${err}`);
  }
}

function buildCriticalFlagMessage(
  agentName: string,
  score?: number,
  flagCount?: number,
  callUrl?: string
): string {
  return `*Agent:* ${agentName}
*Score:* ${score ?? 'N/A'}
*Critical Flags:* ${flagCount ?? 0}
*Action Required:* Immediate review needed
*View Call:* ${callUrl}`;
}

function buildLowScoreMessage(
  agentName: string,
  score?: number,
  callUrl?: string
): string {
  return `*Agent:* ${agentName}
*Compliance Score:* ${score ?? 'N/A'} (below threshold)
*Action Required:* Coaching session recommended
*View Call:* ${callUrl}`;
}

function buildErrorMessage(
  agentName: string,
  error?: string,
  callUrl?: string
): string {
  return `*Agent:* ${agentName}
*Error:* ${error || 'Unknown error'}
*Action Required:* Manual review of call processing
*View Call:* ${callUrl}`;
}
