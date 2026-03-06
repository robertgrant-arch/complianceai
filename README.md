# ComplianceAI — AI-Powered Call Compliance Auditing Platform

A full-stack compliance auditing platform that integrates with Five9 to automatically ingest, transcribe, and AI-audit call recordings for regulatory compliance, tone analysis, and keyword detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 14 App                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Dashboard   │  │ Call Explorer│  │  Agent Scorecard │  │
│  │  /dashboard  │  │   /calls     │  │    /agents       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Call Detail  │  │   Settings   │  │    Audit Log     │  │
│  │ /calls/[id]  │  │  /settings   │  │ /settings/audit  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      API Routes                             │
│  /api/calls  /api/agents  /api/keywords  /api/settings      │
│  /api/dashboard  /api/export  /api/audit-log  /api/jobs     │
├─────────────────────────────────────────────────────────────┤
│                    BullMQ Workers                           │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Ingestion │  │ Transcription│  │     Analysis       │  │
│  │  (Five9)   │  │  (Whisper)   │  │    (GPT-4o)        │  │
│  └────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Notification Worker (Slack/Email)            │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Prisma ORM)  │  Redis (BullMQ)  │  MinIO (S3) │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | TailwindCSS + ShadCN UI |
| **Auth** | NextAuth.js v5 (Credentials + JWT) |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL 15 |
| **Queue** | BullMQ + Redis 7 |
| **Object Storage** | MinIO (S3-compatible) |
| **AI Transcription** | OpenAI Whisper |
| **AI Analysis** | OpenAI GPT-4o |
| **Call Platform** | Five9 (SOAP API) |
| **Audio Player** | WaveSurfer.js |
| **Charts** | Recharts |
| **Notifications** | Slack Webhooks + Nodemailer |
| **Containerization** | Docker + Docker Compose |

---

## Features

### Dashboard
- Real-time KPI cards: total calls, avg compliance score, flagged calls, pending review
- Compliance trend chart (30-day rolling)
- Score distribution histogram
- Recent flags feed with severity indicators
- Top agents leaderboard

### Call Explorer
- Full-text search across agent name, call ID, campaign, ANI, disposition
- Multi-filter: status, direction, date range, score range, flag type, campaign, agent
- Sortable columns with pagination (25/50/100 per page)
- CSV export with all filters applied
- Bulk review actions

### Call Detail
- WaveSurfer.js waveform audio player with playback speed control
- Synchronized transcript viewer with auto-scroll
- Keyword highlighting (prohibited/required/risk/competitor)
- AI audit results panel with score gauges
- Compliance flags with expandable details and timestamp-linked navigation
- Keyword hit list with context quotes
- Reviewer notes and status management

### Agent Scorecard
- Per-agent performance metrics with trend charts
- Score breakdown: compliance, tone, quality
- Call history with quick-access links
- Coaching flag indicators

### Keyword Management
- Multiple keyword lists (prohibited, required, risk, competitor)
- Add/remove keywords with real-time preview
- Enable/disable lists per campaign

### Retention Policy
- Configurable audio and transcript retention periods
- Automated deletion scheduling via BullMQ
- Per-campaign overrides

### Audit Log
- Immutable log of all data access and modifications
- Filter by user, action, resource, date range
- Export to CSV

### Settings
- Five9 SOAP API credentials with connection test
- OpenAI API key and model selection
- Whisper model selection
- Slack webhook and email notification configuration
- Worker concurrency and polling interval

---

## Database Schema

```
User ──────────────── AuditLog
  │
  └── (created_by)
  
CallRecord ─────────── Transcript
     │                    (segments JSON)
     └── AuditResult ─── AuditFlag[]
              │
              └── keywordHits (JSON)

KeywordList ─── Keyword[]

SystemSetting (key-value store)
```

### Models

- **User** — Authentication, RBAC roles (ADMIN, SUPERVISOR, AUDITOR, VIEWER)
- **CallRecord** — Five9 call metadata, S3 audio key, processing status
- **Transcript** — Whisper output with speaker-diarized segments
- **AuditResult** — GPT-4o scores, summary, recommended action
- **AuditFlag** — Individual compliance violations with type/category/timestamp
- **KeywordList** — Named lists of keywords with type classification
- **Keyword** — Individual keyword entries linked to lists
- **SystemSetting** — Key-value store for all configuration
- **AuditLog** — Immutable access/change log

---

## Worker Pipeline

```
Five9 SOAP API
     │
     ▼
[Ingestion Queue]
  - Poll Five9 for new calls in time window
  - Download audio recording to MinIO
  - Create CallRecord with status=pending
     │
     ▼
[Transcription Queue]
  - Download audio from MinIO
  - Send to OpenAI Whisper API
  - Parse segments with speaker diarization
  - Save Transcript to database
  - Update status=analyzing
     │
     ▼
[Analysis Queue]
  - Fetch transcript + keyword lists
  - Build GPT-4o prompt with keyword context
  - Parse structured JSON response
  - Run local keyword matching
  - Save AuditResult + AuditFlags
  - Update status=completed
     │
     ▼
[Notification Queue]
  - Check if critical flags found
  - Send Slack webhook alert
  - Send email notification
  - Update notification_sent=true
```

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- OpenAI API key
- (Optional) Five9 account credentials

### 1. Clone and configure

```bash
git clone <repo>
cd complianceai
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required
NEXTAUTH_SECRET=your-secret-here-min-32-chars
OPENAI_API_KEY=sk-...

# Five9 (optional for demo mode)
FIVE9_USERNAME=your@email.com
FIVE9_PASSWORD=yourpassword
FIVE9_ENABLED=false  # Set to true to enable polling
```

### 2. Start all services

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- MinIO on ports 9000/9001
- Next.js app on port 3000
- BullMQ worker service

### 3. Run database migrations and seed

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

### 4. Access the application

- **App**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

### Default Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@company.com | Admin@123! |
| Supervisor | supervisor@company.com | Supervisor@123! |
| Auditor | auditor@company.com | Auditor@123! |
| Viewer | viewer@company.com | Viewer@123! |

---

## Development Setup

### Without Docker

```bash
# Install dependencies
npm install

# Set up local PostgreSQL and Redis, then:
npx prisma generate
npx prisma migrate dev
npx prisma db seed

# Start Next.js dev server
npm run dev

# Start worker (separate terminal)
npm run worker:dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (32+ chars) |
| `NEXTAUTH_URL` | Yes | App base URL |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `WHISPER_MODEL` | No | Whisper model (default: whisper-1) |
| `GPT_MODEL` | No | GPT model (default: gpt-4o) |
| `FIVE9_USERNAME` | No | Five9 account email |
| `FIVE9_PASSWORD` | No | Five9 account password |
| `FIVE9_ENABLED` | No | Enable Five9 polling (default: false) |
| `FIVE9_POLL_INTERVAL` | No | Poll interval in minutes (default: 15) |
| `S3_ENDPOINT` | No | MinIO/S3 endpoint |
| `S3_ACCESS_KEY` | No | S3 access key |
| `S3_SECRET_KEY` | No | S3 secret key |
| `S3_BUCKET` | No | S3 bucket name (default: complianceai) |
| `SLACK_WEBHOOK_URL` | No | Slack webhook for notifications |
| `SMTP_HOST` | No | SMTP server for email alerts |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `ALERT_EMAIL_TO` | No | Alert recipient email |
| `WORKER_CONCURRENCY` | No | Worker concurrency (default: 3) |

---

## API Reference

### Authentication
All API routes require a valid session cookie (set by NextAuth).

### Calls
- `GET /api/calls` — List calls with filters and pagination
- `GET /api/calls/[id]` — Get call details with transcript and audit result
- `PATCH /api/calls/[id]` — Update call status/notes/reviewer
- `GET /api/calls/[id]/audio` — Get presigned URL for audio playback

### Dashboard
- `GET /api/dashboard` — KPI stats and chart data

### Agents
- `GET /api/agents` — List agents with aggregated scores
- `GET /api/agents/[id]` — Agent detail with call history

### Keywords
- `GET /api/keywords` — List all keyword lists
- `POST /api/keywords` — Create keyword list
- `PATCH /api/keywords/[listId]` — Update keyword list
- `DELETE /api/keywords/[listId]` — Delete keyword list
- `POST /api/keywords/[listId]/items` — Add keyword to list
- `DELETE /api/keywords/[listId]/items` — Remove keyword from list

### Settings
- `GET /api/settings` — Get all system settings
- `PATCH /api/settings` — Update settings (Admin only)

### Retention
- `GET /api/retention` — Get retention policy
- `PATCH /api/retention` — Update retention policy (Admin only)

### Audit Log
- `GET /api/audit-log` — List audit log entries with filters

### Export
- `GET /api/export?type=calls&format=csv` — Export calls to CSV
- `GET /api/export?type=agents&format=csv` — Export agent stats to CSV

### Jobs
- `POST /api/jobs/trigger` — Manually trigger ingestion job (Admin only)
- `GET /api/jobs/status` — Get queue statistics

### Five9
- `POST /api/five9/test` — Test Five9 connection (Admin only)

---

## Role-Based Access Control

| Feature | VIEWER | AUDITOR | SUPERVISOR | ADMIN |
|---|---|---|---|---|
| View calls | ✓ | ✓ | ✓ | ✓ |
| Review calls | — | ✓ | ✓ | ✓ |
| View agents | ✓ | ✓ | ✓ | ✓ |
| Export data | — | ✓ | ✓ | ✓ |
| Manage keywords | — | — | ✓ | ✓ |
| View audit log | — | — | ✓ | ✓ |
| Manage settings | — | — | — | ✓ |
| Manage retention | — | — | — | ✓ |
| Trigger ingestion | — | — | — | ✓ |

---

## Five9 Integration

The platform integrates with Five9 via their SOAP API (`supervisor.five9.com`).

### Supported Operations
- `getCallLogReport` — Fetch call records within a time window
- `getUsersInfo` — Retrieve agent information
- `getRecordingLink` — Get audio recording download URL

### Configuration
Set `FIVE9_ENABLED=true` and provide credentials in `.env`. The worker will poll Five9 every `FIVE9_POLL_INTERVAL` minutes (default: 15).

### Demo Mode
With `FIVE9_ENABLED=false` (default), the ingestion worker is disabled. Use the seed script to populate demo data, or manually trigger ingestion via the Settings page.

---

## Production Deployment

### Docker Compose (Recommended)

```bash
# Build production images
docker compose -f docker-compose.yml build

# Start with production environment
docker compose up -d

# Run migrations
docker compose exec app npx prisma migrate deploy
```

### Environment Hardening

1. Set a strong `NEXTAUTH_SECRET` (use `openssl rand -base64 32`)
2. Use a managed PostgreSQL service (AWS RDS, Supabase, etc.)
3. Use a managed Redis service (AWS ElastiCache, Upstash, etc.)
4. Use AWS S3 instead of MinIO for object storage
5. Configure HTTPS via a reverse proxy (nginx, Caddy, etc.)
6. Set `NODE_ENV=production`

---

## Project Structure

```
complianceai/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # Login page
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx      # Main dashboard
│   │   ├── calls/
│   │   │   ├── page.tsx            # Call explorer
│   │   │   └── [id]/page.tsx       # Call detail
│   │   ├── agents/
│   │   │   ├── page.tsx            # Agent list
│   │   │   └── [id]/page.tsx       # Agent scorecard
│   │   └── settings/
│   │       ├── page.tsx            # General settings
│   │       ├── keywords/page.tsx   # Keyword management
│   │       ├── retention/page.tsx  # Retention policy
│   │       └── audit-log/page.tsx  # Audit log
│   ├── api/
│   │   ├── auth/[...nextauth]/     # NextAuth handler
│   │   ├── calls/                  # Call CRUD + audio
│   │   ├── dashboard/              # Dashboard stats
│   │   ├── agents/                 # Agent stats
│   │   ├── keywords/               # Keyword CRUD
│   │   ├── settings/               # System settings
│   │   ├── retention/              # Retention policy
│   │   ├── audit-log/              # Audit log
│   │   ├── export/                 # CSV export
│   │   ├── five9/test/             # Five9 connection test
│   │   └── jobs/                   # Queue management
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Root redirect
│   └── globals.css                 # Global styles
├── components/
│   ├── calls/
│   │   ├── audio-player.tsx        # WaveSurfer audio player
│   │   ├── transcript-viewer.tsx   # Transcript with highlighting
│   │   └── audit-results.tsx       # Audit results panel
│   ├── layout/
│   │   ├── sidebar.tsx             # Navigation sidebar
│   │   └── header.tsx              # Top header bar
│   ├── shared/
│   │   ├── score-gauge.tsx         # Circular score gauge
│   │   ├── flag-badge.tsx          # Flag severity badge
│   │   └── status-badge.tsx        # Call status badge
│   ├── providers.tsx               # NextAuth + theme providers
│   └── ui/                         # ShadCN UI components
├── lib/
│   ├── prisma.ts                   # Prisma client singleton
│   ├── auth-helpers.ts             # Server-side auth utilities
│   ├── audit.ts                    # Audit log helpers
│   ├── rate-limit.ts               # API rate limiting
│   ├── five9.ts                    # Five9 SOAP client
│   ├── s3.ts                       # S3/MinIO client
│   └── utils.ts                    # Shared utilities
├── worker/
│   ├── index.ts                    # Worker entry point
│   ├── queues.ts                   # BullMQ queue definitions
│   ├── redis.ts                    # Redis connection
│   └── processors/
│       ├── ingestion.processor.ts  # Five9 ingestion
│       ├── transcription.processor.ts  # Whisper transcription
│       ├── analysis.processor.ts   # GPT-4o analysis
│       └── notification.processor.ts   # Slack/email alerts
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── seed.ts                     # Demo data seed
├── auth.ts                         # NextAuth configuration
├── middleware.ts                   # Route protection + RBAC
├── docker-compose.yml              # All services
├── Dockerfile                      # Next.js app image
├── Dockerfile.worker               # Worker service image
└── .env.example                    # Environment template
```

---

## License

MIT
