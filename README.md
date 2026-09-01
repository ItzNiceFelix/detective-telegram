# Detective Telegram — Multiplayer Cooperative Detective Game

A Telegram-based cooperative detective game where groups of players collaborate to solve fictional crime mysteries using evidence discovery, interrogation, contradiction detection, and proof evaluation.

**Status**: Milestone 9 — Final Beta Hardening & Release Readiness  
**Target**: Closed Beta Launch  
**Architecture**: Modular Monolith / Serverless (Vercel)

---

## 🎮 Quick Start

### For Players
Send `/start` to the Detective Telegram bot in a Telegram group chat:
```
@detective_telegram_bot /start
```

### For Developers

#### Prerequisites
- Node.js 18+
- npm or yarn
- Telegram bot token (from @BotFather)
- Firebase project with Firestore
- Vercel account (for deployment)

#### Setup
```bash
# Clone repository
git clone <repo-url>
cd detective-telegram

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Set your credentials
export TELEGRAM_BOT_TOKEN="your-token"
export FIREBASE_PROJECT_ID="your-project"
# ... see docs/BETA-READINESS.md for full list

# Run tests
npm run test
npm run typecheck

# Build
npm run build

# Deploy to Vercel
vercel deploy --prod
```

---

## 📁 Project Structure

```
detective-telegram/
├── api/
│   ├── telegram.ts         # Webhook handler for Telegram updates
│   ├── admin.ts            # Protected admin operations
│   ├── cron.ts             # Maintenance & scheduled tasks (optional)
│   └── health.ts           # Health check endpoint
│
├── src/
│   ├── domain/             # Game domain logic (locked contracts)
│   │   ├── services/       # 11 pure, deterministic game services
│   │   ├── entities.ts     # Domain entities (SesiKasus, etc)
│   │   ├── enums.ts        # Game state enums
│   │   └── types.ts        # Type definitions
│   │
│   ├── application/        # Application layer
│   │   ├── services/       # Orchestration services
│   │   ├── contracts.ts    # Service interfaces
│   │   └── config.ts       # App configuration
│   │
│   ├── kasus/              # Case/CaseVersion management
│   │   ├── case-bible.ts   # Case schema & helpers
│   │   ├── versi-kasus.ts  # CaseVersion entity
│   │   └── generasi-kasus.ts  # Case generation logic
│   │
│   ├── infrastructure/     # Database & external services
│   │   ├── repositories/   # Firestore adapters
│   │   ├── firebase/       # Firebase initialization
│   │   └── adapters/       # API integrations
│   │
│   ├── ai/                 # AI integration
│   │   ├── contracts.ts    # AI provider interface
│   │   ├── detektif-asisten.ts  # AI assistant for gameplay
│   │   └── visual-pipeline.ts   # Image generation
│   │
│   ├── security/           # Authorization & security
│   │   └── authorization/  # Permission checks
│   │
│   ├── event/              # Domain events
│   │   ├── contracts.ts    # Event types
│   │   └── domain.ts       # Event emitter
│   │
│   └── fondasi/            # Foundation utilities
│       ├── eror.ts         # Custom error types
│       ├── primitif.ts     # Branded types (IdGrup, etc)
│       └── hasil.ts        # Result/Either type
│
├── tests/
│   └── unit/               # Unit & integration tests
│       ├── golden-case.test.ts      # Full gameplay test
│       ├── investigasi.test.ts      # Investigation mechanics
│       ├── interogasi.test.ts       # Interrogation logic
│       ├── tuduhan.test.ts          # Accusation & voting
│       └── ... (29 test files)
│
├── docs/
│   ├── 01-executive-summary.md      # Product overview
│   ├── 03-gameplay.md               # Game mechanics
│   ├── 05-architecture.md           # Technical architecture
│   ├── 06-data-model.md             # Firestore schema
│   ├── 18-domain-contracts.md       # Domain entity contracts
│   ├── 21-runtime-contract.md       # Runtime & deployment constraints
│   ├── 23-security-moderation-contract.md
│   ├── 26-coding-baseline.md        # LOCKED baseline
│   ├── 27-final-audit.md            # Architecture audit
│   ├── BETA-READINESS.md            # Beta deployment checklist
│   ├── PRODUCTION-RUNBOOK.md        # Operational procedures
│   └── IMPLEMENTATION-MAP.md        # Detailed implementation roadmap
│
├── package.json
├── tsconfig.json
└── README.md                        # This file
```

---

## 🏗️ Architecture Overview

### Layered Architecture
```
Telegram API
    ↓
/api/telegram.ts (Webhook Handler)
    ↓
Application Services (Orchestration)
    ↓
Domain Services (Pure Game Logic)
    ↓
Firestore (Persistence)
```

### Design Principles

**🎯 Authority & Truth**:
- `CaseVersion` = canonical case definition (immutable after publish)
- `CaseSession` = runtime mutable state (current game progress)
- Domain Services = authoritative game logic
- AI = non-authoritative content renderer

**🔒 Locked Contracts**:
- Domain hierarchy and entity relationships are frozen
- Session state machine is frozen
- Evidence, interrogation, proof semantics are frozen
- See `docs/26-coding-baseline.md` for locked decisions

**🛡️ Safety**:
- All gameplay mutations wrapped in Firestore transactions
- Idempotency tracked to prevent duplicate rewards
- No AI provider calls inside transactions
- Fallbacks for AI and Telegram failures

**🚀 Performance**:
- 4 Vercel serverless functions (hard budget: 12 max)
- Modular monolith architecture
- Free-tier Firestore compatible (~14 writes/min average)
- Lazy-computed derived status (INACTIVE, COLD)

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run specific test file
npm run test tests/unit/golden-case.test.ts

# Type check
npm run typecheck

# Build
npm run build
```

### Test Coverage
- ✅ 29 unit/integration tests
- ✅ Domain logic (state machine, evidence, interrogation, scoring)
- ✅ Concurrency scenarios
- ✅ Idempotency patterns
- ✅ Case validation
- ⚠️ API handlers (need implementation)
- ⚠️ E2E with real Telegram (need implementation)

---

## 🔐 Security Model

### Authentication
- Telegram webhook secret validation on every request
- Admin operations require secret token verification
- All user input treated as untrusted

### Authorization
- Group boundary enforcement (no cross-group access)
- Spectator vs detective role separation
- Gameplay mutation restricted to authenticated group members

### Data Protection
- No secrets in repository (checked on build)
- Environment variables for all credentials
- Firestore security rules restrict access
- Audit logging for sensitive operations

See `docs/23-security-moderation-contract.md` for full security contract.

---

## 🎓 Key Concepts

### Game Flow
```
GROUP ADMIN
    /start
        ↓
    CREATE SESSION (LOBBY)
        ↓
PLAYER 1-6
    join + /start case
        ↓
    OPEN SESSION
        /investigate scene
        /inspect object → discover evidence
        /interrogate suspect
        /confront with evidence
        /build theory
        /accuse culprit
        ↓
    CLEARED (SOLVED/FAILED)
        ↓
    ARCHIVED (historical)
```

### Core Mechanics

**Investigation**: Discover scenes and objects, extract evidence  
**Evidence**: Indexed facts from crime scene  
**Interrogation**: Dialogue trees with hybrid AI narratives  
**Contradiction**: Evidence conflicts that reveal truth  
**Proof Graph**: Nodes (evidence, events, inferences) and edges (supports, contradicts)  
**Accusation**: Final player theory voted by group, evaluated against canonical solution  
**Scoring**: Points for discovery, correct hypothesis, efficiency

### Important Constraints

- **One active session per group** (design choice for simplicity)
- **Max 6 active detectives** (UX constraint)
- **Spectators read-only** (they see all state but can't mutate)
- **Immutable published cases** (corrections create new versions)
- **Unique solution per case** (solvability is verified)
- **Terminal wrong accusation** (no retry, session ends with FAILED)

---

## 📚 Documentation Navigation

### For Developers Implementing Features
1. **Start**: `docs/26-coding-baseline.md` (locked domain contracts)
2. **Understand Mechanics**: `docs/03-gameplay.md`
3. **Learn Architecture**: `docs/05-architecture.md` + `docs/06-data-model.md`
4. **Check Contracts**: `docs/18-domain-contracts.md`
5. **Implementation Details**: `docs/IMPLEMENTATION-MAP.md`

### For DevOps / Deployment
1. **Checklist**: `docs/BETA-READINESS.md`
2. **Emergency Procedures**: `docs/PRODUCTION-RUNBOOK.md`
3. **Environment Setup**: Section "Environment Variables" below
4. **Deployment Steps**: `docs/BETA-READINESS.md` § 12

### For Security Review
1. `docs/23-security-moderation-contract.md`
2. `docs/BETA-READINESS.md` § 5
3. `docs/PRODUCTION-RUNBOOK.md` § 11

### For Product Managers
1. `docs/01-executive-summary.md`
2. `docs/02-product-scope.md`
3. `docs/03-gameplay.md`

---

## 🚀 Deployment

### Prerequisites
- Telegram bot token (from @BotFather)
- Firebase Firestore project
- Vercel account connected to GitHub

### Environment Variables
```bash
# Required
TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234..."
TELEGRAM_SECRET="webhook-secret-token"
FIREBASE_PROJECT_ID="detective-telegram-prod"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@appspot.gserviceaccount.com"
ADMIN_SECRET_TOKEN="admin-operations-secret"

# Optional
AI_PROVIDER="openai"  # or "anthropic", "gemini", "fake"
AI_MODEL="gpt-4"
OPENAI_API_KEY="sk-..."
LOG_LEVEL="info"
```

### Deployment Flow
```bash
# 1. Verify locally
npm run typecheck && npm run test && npm run build

# 2. Deploy to Vercel staging
vercel deploy

# 3. Run smoke test on staging
npm run test:smoke -- --url https://staging.your-project.vercel.app

# 4. Deploy to production
vercel deploy --prod

# 5. Configure Telegram webhook
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET"

# 6. Verify
curl https://your-project.vercel.app/api/health
```

For detailed deployment and incident procedures, see `docs/PRODUCTION-RUNBOOK.md`.

---

## 💬 Naming Conventions

**Internal source code uses Bahasa Indonesia** for readability by Indonesian developers.

Examples:
- Functions: `selidikiAdegan()`, `interogasiTersangka()`, `ajukanTuduhan()`
- Classes: `MesinPermainan`, `LayananKasus`, `RepositoriSesiKasus`
- Variables: `sesiKasus`, `buktiDitemukan`, `pemainAktif`

External terminology remains in English:
- Telegram, Firebase, Firestore, Vercel, HTTP, JSON, API, TypeScript, etc.

---

## 🐛 Troubleshooting

### TypeScript Errors
```bash
npm run typecheck
# Most common: branded type mismatches
# Solution: Ensure types imported from fondasi/primitif.ts
```

### Build Errors
```bash
npm run build
# Check that /api directory has only 4 files:
ls api/
# Expected: telegram.ts, admin.ts, cron.ts, health.ts
```

### Firestore Connection
```bash
# Verify credentials are set
echo $FIREBASE_PROJECT_ID
echo $FIREBASE_CLIENT_EMAIL

# Test connection
npm run test tests/unit/case-version-persistence.test.ts
```

### Webhook Issues
```bash
# Check webhook is registered
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo

# Disable if stuck
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook
```

---

## 📊 Monitoring

### Key Metrics
- **Availability**: > 99%
- **Error Rate**: < 1%
- **Case Completion Rate**: > 80%
- **API Latency**: < 1000ms (p99)

### Observability
- Structured JSON logging with correlation IDs
- Firestore quota tracking
- Telegram API latency monitoring
- AI provider request/response logging

See `docs/24-observability-testing-deployment.md` for details.

---

## 🤝 Contributing

### Code Style
- TypeScript strict mode
- No `any` types
- Domain-driven design
- Pure functions in domain layer
- Comprehensive error types

### Before Committing
```bash
npm run typecheck
npm run test
npm run build
# Verify no secrets added
git diff --cached | grep -i token
```

### Domain Changes
Changes to locked contracts require approval:
- Domain services
- Entity relationships
- State machines
- Evidence/proof semantics
- Authorization rules

See `docs/26-coding-baseline.md` § Implementation Rule.

---

## 📞 Support & Contact

**For Issues**:
- Bug reports: GitHub Issues
- Questions: GitHub Discussions

**For Deployment**:
- See `docs/PRODUCTION-RUNBOOK.md`
- Escalation path documented in runbook

---

## 📄 License

[Specify license - e.g., MIT, proprietary, etc.]

---

## 📅 Milestone Timeline

- **Milestone 8A/8B**: Domain layer + core services ✅
- **Milestone 9**: API handlers + security + hardening (current)
- **Milestone 10+**: Open beta expansion, scaling, new features

See `docs/12-delivery-plan.md` for detailed roadmap.

---

**Last Updated**: 2026-09-01  
**Repository**: [Link]  
**Status**: In Development
- Difficulty diubah menjadi **Star Rating (⭐1–5)**, dihitung otomatis & deterministik
  saat case digenerate, tidak dapat dipilih pemain, dan disembunyikan sebelum case
  dimulai. Lihat `docs/03-gameplay.md` 3.12.
- Data model `case_sessions` dan `cases` diperbarui untuk mendukung field-field baru
  di atas. Lihat `docs/06-data-model.md`.
- Analisa kelayakan free-tier diperbarui untuk skala closed beta ini — jauh lebih
  ringan dibanding open beta publik. Lihat `docs/09-free-tier.md` 9.8.

Tidak ada asumsi bahwa seluruh fitur harus aktif pada hari pertama. Namun kontrak inti dirancang sejak awal agar implementasi tidak membutuhkan refactor arsitektur besar ketika fitur open-beta diaktifkan.


### Locked design baseline

Review hingga saat ini telah mengunci:

- `Case -> CaseVersion -> CaseSession`;
- session state lifecycle dan derived inactivity/cold status;
- shared cooperative investigation + personal contribution credit;
- deterministic gameplay truth;
- Evidence/Observation/Statement/Contradiction separation;
- Timeline/Causality + Proof Graph;
- hybrid interrogation (deterministic semantic response + AI rendering);
- immutable Case Bible contract dan validation gates;
- shared multiplayer state + individual contribution credit;
- cooperative accusation proposal + one final accusation;
- bounded scoring, idempotent rewards, dan concurrency-safe progression.

Detail schema ada di `docs/15-case-bible-schema.md`.


## Current Lock Status

The proposal progressed through v7 and is now consolidated into the coding baseline in v8.

New locked areas include:

- Firestore persistence boundaries and bounded `CaseSession` aggregate;
- transactional mutation and concurrency rules;
- idempotency and duplicate-delivery handling;
- post-commit event-driven side effects;
- event retention and indexing strategy;
- server-side mutation authority;
- cross-domain ownership map and dependency rules.

Next review target: the **AI Case Generation & Validation Contract**, including the exact Case Bible schema, generator stages, validator invariants, asset manifest, regeneration policy, and publish gate.


## Current locked baseline

The proposal now locks the full chain from CaseVersion truth through runtime gameplay and AI content generation. See `docs/20-ai-generation-validation-contract.md` for the latest AI/build-time contract.

## Current Lock Status — v8

The project has now locked the runtime/persistence boundary and the free-tier deployment posture.

Key constraint: the implementation must remain within a **12-function Vercel ceiling**, with an initial target of 4 deployed function entrypoints. Business logic is modularized outside the route tree so feature growth does not create serverless function sprawl.

The product baseline, gameplay domain, evidence model, case generation/validation model, player/group/scoring model, persistence contract, Telegram UX contract, security contract, observability/testing contract, and final closed/open-beta acceptance gates are documented in the `docs/` directory.

## v8 Coding Baseline

Implementation source of truth:
- `docs/26-coding-baseline.md`
- `docs/27-final-audit.md`
- all domain contracts referenced therein.

The project is now considered **ready to enter coding**. New changes that affect locked invariants require an explicit decision-log entry.
