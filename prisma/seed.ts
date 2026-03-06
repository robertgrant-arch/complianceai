import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// C-02: Minimum 12 bcrypt rounds for password hashing
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Users ────────────────────────────────────────────────────────────────────
  // C-02: All passwords hashed with bcrypt at 12 rounds minimum
  const adminPassword = await bcrypt.hash('Admin@123!', BCRYPT_ROUNDS);
  const supervisorPassword = await bcrypt.hash('Supervisor@123!', BCRYPT_ROUNDS);
  const auditorPassword = await bcrypt.hash('Auditor@123!', BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      name: 'System Administrator',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@company.com' },
    update: {},
    create: {
      email: 'supervisor@company.com',
      name: 'Team Supervisor',
      password: supervisorPassword,
      role: 'SUPERVISOR',
    },
  });

  const auditor = await prisma.user.upsert({
    where: { email: 'auditor@company.com' },
    update: {},
    create: {
      email: 'auditor@company.com',
      name: 'Compliance Auditor',
      password: auditorPassword,
      role: 'AUDITOR',
    },
  });

  console.log('✅ Users created:', admin.email, supervisor.email, auditor.email);

  // ─── Keyword Lists (H-01: JSON keywords, C-06: UPPERCASE enum types) ──────────
  await prisma.keywordList.deleteMany({
    where: {
      id: { in: ['seed-prohibited', 'seed-required', 'seed-risk', 'seed-competitor'] },
    },
  });

  const prohibitedList = await prisma.keywordList.create({
    data: {
      id: 'seed-prohibited',
      name: 'Prohibited Phrases',
      description: 'Phrases agents must never use',
      type: 'PROHIBITED', // C-06: uppercase enum
      isActive: true,
      // H-01: keywords stored as JSON array of KeywordItem objects
      keywords: [
        { word: 'guaranteed', isCaseSensitive: false, isRegex: false },
        { word: 'free', isCaseSensitive: false, isRegex: false },
        { word: 'no cost to you', isCaseSensitive: false, isRegex: false },
        { word: 'best plan', isCaseSensitive: false, isRegex: false },
        { word: 'you need this plan', isCaseSensitive: false, isRegex: false },
        { word: 'everyone qualifies', isCaseSensitive: false, isRegex: false },
        { word: 'guaranteed approval', isCaseSensitive: false, isRegex: false },
        { word: 'no questions asked', isCaseSensitive: false, isRegex: false },
      ],
    },
  });

  const requiredList = await prisma.keywordList.create({
    data: {
      id: 'seed-required',
      name: 'Required Disclosures',
      description: 'Phrases agents must include in every call',
      type: 'REQUIRED',
      isActive: true,
      keywords: [
        { word: 'this call may be recorded', isCaseSensitive: false, isRegex: false },
        { word: 'not affiliated with Medicare', isCaseSensitive: false, isRegex: false },
        { word: 'scope of appointment', isCaseSensitive: false, isRegex: false },
        { word: 'limitations and exclusions', isCaseSensitive: false, isRegex: false },
      ],
    },
  });

  const riskList = await prisma.keywordList.create({
    data: {
      id: 'seed-risk',
      name: 'Risk Indicators',
      description: 'Phrases indicating potential compliance risk',
      type: 'RISK',
      isActive: true,
      keywords: [
        { word: 'complaint', isCaseSensitive: false, isRegex: false },
        { word: 'attorney', isCaseSensitive: false, isRegex: false },
        { word: 'lawsuit', isCaseSensitive: false, isRegex: false },
        { word: 'lied to me', isCaseSensitive: false, isRegex: false },
        { word: 'fraud', isCaseSensitive: false, isRegex: false },
        { word: 'scam', isCaseSensitive: false, isRegex: false },
        { word: 'Better Business Bureau', isCaseSensitive: false, isRegex: false },
      ],
    },
  });

  const competitorList = await prisma.keywordList.create({
    data: {
      id: 'seed-competitor',
      name: 'Competitor Mentions',
      description: 'Track competitor mentions in calls',
      type: 'COMPETITOR',
      isActive: true,
      keywords: [
        { word: 'Humana', isCaseSensitive: false, isRegex: false },
        { word: 'UnitedHealthcare', isCaseSensitive: false, isRegex: false },
        { word: 'Aetna', isCaseSensitive: false, isRegex: false },
        { word: 'Cigna', isCaseSensitive: false, isRegex: false },
        { word: 'Blue Cross', isCaseSensitive: false, isRegex: false },
        { word: 'Kaiser', isCaseSensitive: false, isRegex: false },
        { word: 'Anthem', isCaseSensitive: false, isRegex: false },
      ],
    },
  });

  console.log('✅ Keyword lists created');

  // ─── System Settings ──────────────────────────────────────────────────────────
  // H-05: compliance_auditor_prompt stored in DB for UI editing
  const defaultSettings = [
    { key: 'org_name', value: 'ComplianceAI Demo' },
    { key: 'timezone', value: 'America/New_York' },
    { key: 'five9_enabled', value: 'false' },
    { key: 'five9_poll_interval', value: '15' },
    { key: 'five9_domain', value: 'app.five9.com' },
    { key: 'five9_username', value: '' },
    { key: 'five9_password', value: '' },
    { key: 'whisper_model', value: 'whisper-1' },
    { key: 'gpt_model', value: 'gpt-4o' },
    { key: 'worker_concurrency', value: '3' },
    { key: 'enable_diarization', value: 'true' },
    { key: 'retention_days', value: '365' },
    { key: 'retention_delete_audio', value: 'false' },
    { key: 'retention_delete_transcripts', value: 'false' },
    { key: 'critical_score_threshold', value: '60' },
    { key: 'notify_critical_flags', value: 'true' },
    { key: 'notify_low_scores', value: 'true' },
    { key: 'notify_errors', value: 'true' },
    { key: 'slack_webhook_url', value: '' },
    { key: 'alert_email', value: '' },
    // H-02: Control read audit logging (false = only log writes)
    { key: 'audit_log_reads', value: 'false' },
    // H-05: GPT compliance auditor system prompt (editable via Settings UI)
    {
      key: 'compliance_auditor_prompt',
      value: `You are an expert compliance auditor for insurance sales calls, specializing in Medicare, ACA, and supplemental insurance regulations.

Your task is to analyze call transcripts and provide:
1. **Compliance Score (0-100)**: How well did the agent follow regulatory requirements? Did they make any prohibited statements or miss required disclosures?
2. **Tone Score (0-100)**: Was the agent professional, empathetic, and appropriate? Did they pressure or mislead the customer?
3. **Quality Score (0-100)**: Did the agent handle the call effectively? Did they resolve the customer's issue? Was the call structured properly?
4. **Overall Score (0-100)**: Weighted average (Compliance: 50%, Tone: 25%, Quality: 25%)

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": number,
  "complianceScore": number,
  "toneScore": number,
  "qualityScore": number,
  "summary": "2-3 sentence summary of the call",
  "recommendedAction": "NONE" | "COACHING" | "REVIEW" | "ESCALATE",
  "sentimentAgent": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "sentimentCustomer": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "topicsDiscussed": ["topic1", "topic2"],
  "callOutcome": "brief outcome description",
  "flags": [
    {
      "type": "CRITICAL" | "WARNING" | "INFO",
      "category": "COMPLIANCE" | "TONE" | "KEYWORD" | "QUALITY" | "REQUIRED" | "RISK" | "COMPETITOR",
      "description": "detailed description",
      "timestamp": null,
      "keyword": null,
      "quote": null
    }
  ]
}`,
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ System settings created');

  // ─── Retention Policies (H-09) ────────────────────────────────────────────────
  const retentionDefaults = [
    { callStatus: 'COMPLETED', retainDays: 365, deleteAudio: true, deleteRecord: false },
    { callStatus: 'ERROR', retainDays: 30, deleteAudio: true, deleteRecord: true },
    { callStatus: 'PENDING', retainDays: 7, deleteAudio: true, deleteRecord: true },
  ];

  for (const policy of retentionDefaults) {
    await prisma.retentionPolicy.upsert({
      where: { callStatus: policy.callStatus },
      update: {},
      create: policy,
    });
  }

  console.log('✅ Retention policies seeded');

  // ─── Demo Call Records ────────────────────────────────────────────────────────
  const sampleAgents = [
    { id: 'agent-001', name: 'James Wilson' },
    { id: 'agent-002', name: 'Maria Garcia' },
    { id: 'agent-003', name: 'Emily Rodriguez' },
    { id: 'agent-004', name: 'David Kim' },
    { id: 'agent-005', name: 'Jessica Williams' },
  ];

  const campaigns = ['Medicare Advantage', 'Part D', 'Supplement', 'Medicaid', 'ACA Plans'];
  const dispositions = ['Sale', 'No Sale', 'Callback', 'DNC', 'Not Interested', 'Transferred'];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const agent = sampleAgents[Math.floor(Math.random() * sampleAgents.length)];
    const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    const disposition = dispositions[Math.floor(Math.random() * dispositions.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const duration = Math.floor(Math.random() * 1200) + 120;
    const endTime = new Date(startTime.getTime() + duration * 1000);
    // C-06: Use uppercase enum values
    const statusOptions: Array<'COMPLETED' | 'PENDING' | 'ERROR'> = [
      'COMPLETED', 'COMPLETED', 'COMPLETED', 'PENDING', 'ERROR',
    ];
    const status = statusOptions[Math.floor(Math.random() * statusOptions.length)];
    // C-06: Use uppercase enum value for direction
    const callDirection: 'INBOUND' | 'OUTBOUND' = Math.random() > 0.3 ? 'INBOUND' : 'OUTBOUND';

    let created;
    try {
      created = await prisma.callRecord.create({
        data: {
          five9CallId: `FIVE9-DEMO-${Date.now()}-${i}`,
          agentId: agent.id,
          agentName: agent.name,
          campaignName: campaign,
          callDirection,
          ani: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          dnis: `+18005551${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          startTime,
          endTime,
          duration,
          disposition,
          s3Key: `recordings/${startTime.getFullYear()}/${String(startTime.getMonth() + 1).padStart(2, '0')}/${agent.id}/${Date.now()}-${i}.wav`,
          status,
          reviewedAt: status === 'COMPLETED' ? endTime : null,
        },
      });
    } catch {
      continue; // Skip duplicates
    }

    if (status === 'COMPLETED') {
      const complianceScore = Math.floor(Math.random() * 40) + 55;
      const toneScore = Math.floor(Math.random() * 30) + 65;
      const qualityScore = Math.floor(Math.random() * 35) + 60;
      const overallScore = Math.round(complianceScore * 0.5 + toneScore * 0.25 + qualityScore * 0.25);

      // C-06: Use uppercase enum values
      const recommendedAction: 'NONE' | 'COACHING' | 'REVIEW' | 'ESCALATE' =
        overallScore >= 80 ? 'NONE' :
        overallScore >= 65 ? 'COACHING' :
        overallScore >= 50 ? 'REVIEW' : 'ESCALATE';

      const sentimentAgent: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' =
        overallScore >= 70 ? 'POSITIVE' : 'NEUTRAL';
      const sentimentCustomer: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' =
        Math.random() > 0.5 ? 'POSITIVE' : 'NEUTRAL';

      const auditResult = await prisma.auditResult.create({
        data: {
          callRecordId: created.id,
          overallScore,
          complianceScore,
          toneScore,
          qualityScore,
          summary: `Agent ${agent.name} handled a ${campaign} call with ${overallScore >= 75 ? 'satisfactory' : 'below-average'} compliance. Overall performance ${overallScore >= 80 ? 'meets' : 'falls below'} company standards.`,
          recommendedAction,
          sentimentAgent,
          sentimentCustomer,
          topicsDiscussed: JSON.stringify(['Medicare coverage', 'plan benefits', 'enrollment']),
          callOutcome: disposition,
        },
      });

      // Add flags for low-scoring calls — C-06: uppercase enum values
      if (complianceScore < 75) {
        await prisma.auditFlag.create({
          data: {
            auditResultId: auditResult.id,
            type: 'CRITICAL',
            category: 'COMPLIANCE',
            description: 'Required Medicare disclaimer not provided',
            timestamp: 83,
          },
        });
      }
      if (toneScore < 70) {
        await prisma.auditFlag.create({
          data: {
            auditResultId: auditResult.id,
            type: 'WARNING',
            category: 'TONE',
            description: 'Agent tone became impatient during objection handling',
            timestamp: 255,
            quote: 'Look, I already explained this to you.',
          },
        });
      }
      if (Math.random() > 0.6) {
        await prisma.auditFlag.create({
          data: {
            auditResultId: auditResult.id,
            type: 'WARNING',
            category: 'KEYWORD',
            description: 'Prohibited phrase detected: "guaranteed"',
            timestamp: 165,
            keyword: 'guaranteed',
            quote: 'This plan is guaranteed to save you money.',
          },
        });
      }

      // Create transcript
      await prisma.callTranscript.create({
        data: {
          callRecordId: created.id,
          fullText: `Agent: Thank you for calling, this is ${agent.name}. How can I help you today?\nCustomer: Hi, I'm calling about Medicare plans.\nAgent: Great, I'd be happy to help you with that. Before we begin, I want to let you know that this call may be recorded for quality assurance purposes. Is that okay?\nCustomer: Yes, that's fine.\nAgent: Perfect. Can I get your name and date of birth to pull up your information?`,
          segments: JSON.stringify([
            { speaker: 'Agent', startTime: 0, endTime: 5, text: `Thank you for calling, this is ${agent.name}. How can I help you today?` },
            { speaker: 'Customer', startTime: 6, endTime: 12, text: "Hi, I'm calling about Medicare plans." },
            { speaker: 'Agent', startTime: 13, endTime: 28, text: "Great, I'd be happy to help you with that. Before we begin, I want to let you know that this call may be recorded for quality assurance purposes. Is that okay?" },
            { speaker: 'Customer', startTime: 29, endTime: 32, text: "Yes, that's fine." },
            { speaker: 'Agent', startTime: 33, endTime: 45, text: "Perfect. Can I get your name and date of birth to pull up your information?" },
          ]),
          wordCount: 85,
          language: 'en',
          durationSeconds: duration,
        },
      });
    }
  }

  console.log('✅ Sample call records created');

  // ─── Audit Log Entries ────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'LOGIN',
        resource: 'auth',
        details: { method: 'credentials' },
        ipAddress: '127.0.0.1',
      },
      {
        userId: admin.id,
        action: 'CREATE',
        resource: 'keyword_list',
        resourceId: 'seed-prohibited',
        details: { name: 'Prohibited Phrases' },
        ipAddress: '127.0.0.1',
      },
      {
        userId: supervisor.id,
        action: 'LOGIN',
        resource: 'auth',
        details: { method: 'credentials' },
        ipAddress: '127.0.0.1',
      },
    ],
  });

  console.log('✅ Audit log entries created');
  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('  Admin:      admin@company.com / Admin@123!');
  console.log('  Supervisor: supervisor@company.com / Supervisor@123!');
  console.log('  Auditor:    auditor@company.com / Auditor@123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
