import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Users ────────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123!', 12);
  const supervisorPassword = await bcrypt.hash('Supervisor@123!', 12);
  const auditorPassword = await bcrypt.hash('Auditor@123!', 12);

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

  // ─── Keyword Lists ────────────────────────────────────────────────────────────
  // Delete existing seed keyword lists to avoid duplicates
  await prisma.keywordList.deleteMany({
    where: { id: { in: ['seed-prohibited', 'seed-required', 'seed-risk', 'seed-competitor'] } },
  });

  const prohibitedList = await prisma.keywordList.create({
    data: {
      id: 'seed-prohibited',
      name: 'Prohibited Phrases',
      description: 'Phrases agents must never use',
      type: 'prohibited',
      isActive: true,
      keywords: {
        create: [
          { word: 'guaranteed' },
          { word: 'free' },
          { word: 'no cost to you' },
          { word: 'best plan' },
          { word: 'you need this plan' },
          { word: 'everyone qualifies' },
          { word: 'guaranteed approval' },
          { word: 'no questions asked' },
        ],
      },
    },
  });

  const requiredList = await prisma.keywordList.create({
    data: {
      id: 'seed-required',
      name: 'Required Disclosures',
      description: 'Phrases agents must include in every call',
      type: 'required',
      isActive: true,
      keywords: {
        create: [
          { word: 'this call may be recorded' },
          { word: 'not affiliated with Medicare' },
          { word: 'scope of appointment' },
          { word: 'limitations and exclusions' },
        ],
      },
    },
  });

  const riskList = await prisma.keywordList.create({
    data: {
      id: 'seed-risk',
      name: 'Risk Indicators',
      description: 'Phrases indicating potential compliance risk',
      type: 'risk',
      isActive: true,
      keywords: {
        create: [
          { word: 'complaint' },
          { word: 'attorney' },
          { word: 'lawsuit' },
          { word: 'lied to me' },
          { word: 'fraud' },
          { word: 'scam' },
          { word: 'Better Business Bureau' },
        ],
      },
    },
  });

  const competitorList = await prisma.keywordList.create({
    data: {
      id: 'seed-competitor',
      name: 'Competitor Mentions',
      description: 'Track competitor mentions in calls',
      type: 'competitor',
      isActive: true,
      keywords: {
        create: [
          { word: 'Humana' },
          { word: 'UnitedHealthcare' },
          { word: 'Aetna' },
          { word: 'Cigna' },
          { word: 'Blue Cross' },
          { word: 'Kaiser' },
          { word: 'Anthem' },
        ],
      },
    },
  });

  console.log('✅ Keyword lists created');

  // ─── System Settings ──────────────────────────────────────────────────────────
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
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ System settings created');

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
    const statusOptions = ['completed', 'completed', 'completed', 'pending', 'error'];
    const status = statusOptions[Math.floor(Math.random() * statusOptions.length)];

    let created;
    try {
      created = await prisma.callRecord.create({
        data: {
          five9CallId: `FIVE9-DEMO-${Date.now()}-${i}`,
          agentId: agent.id,
          agentName: agent.name,
          campaignName: campaign,
          callDirection: Math.random() > 0.3 ? 'inbound' : 'outbound',
          ani: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          dnis: `+18005551${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          startTime,
          endTime,
          duration,
          disposition,
          s3Key: `recordings/${startTime.getFullYear()}/${String(startTime.getMonth() + 1).padStart(2, '0')}/${agent.id}/${Date.now()}-${i}.wav`,
          status,
          reviewedAt: status === 'completed' ? endTime : null,
        },
      });
    } catch {
      continue; // Skip duplicates
    }

    if (status === 'completed') {
      const complianceScore = Math.floor(Math.random() * 40) + 55;
      const toneScore = Math.floor(Math.random() * 30) + 65;
      const qualityScore = Math.floor(Math.random() * 35) + 60;
      const overallScore = Math.round(complianceScore * 0.5 + toneScore * 0.25 + qualityScore * 0.25);

      const recommendedAction = overallScore >= 80 ? 'none' :
        overallScore >= 65 ? 'coaching' :
        overallScore >= 50 ? 'review' : 'escalate';

      const auditResult = await prisma.auditResult.create({
        data: {
          callRecordId: created.id,
          overallScore,
          complianceScore,
          toneScore,
          qualityScore,
          summary: `Agent ${agent.name} handled a ${campaign} call with ${overallScore >= 75 ? 'satisfactory' : 'below-average'} compliance. Overall performance ${overallScore >= 80 ? 'meets' : 'falls below'} company standards.`,
          recommendedAction,
          sentimentAgent: overallScore >= 70 ? 'positive' : 'neutral',
          sentimentCustomer: Math.random() > 0.5 ? 'positive' : 'neutral',
          topicsDiscussed: JSON.stringify(['Medicare coverage', 'plan benefits', 'enrollment']),
          callOutcome: disposition,
        },
      });

      // Add flags for low-scoring calls
      if (complianceScore < 75) {
        await prisma.auditFlag.create({
          data: {
            auditResultId: auditResult.id,
            type: 'CRITICAL',
            category: 'compliance',
            description: 'Required Medicare disclaimer not provided',
            timestamp: 83,
            quote: null,
          },
        });
      }
      if (toneScore < 70) {
        await prisma.auditFlag.create({
          data: {
            auditResultId: auditResult.id,
            type: 'WARNING',
            category: 'tone',
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
            category: 'keyword',
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
