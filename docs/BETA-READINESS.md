# Beta Readiness Checklist — Detective Telegram

**Status**: Milestone 9 Implementation Guide  
**Target**: Closed/Open Beta Deployment  
**Last Updated**: 2026-09-01

---

## 1. CORE GAMEPLAY — ✅ COMPLETE

### Domain Layer
- ✅ 11 domain services implemented with pure, deterministic, idempotent functions
- ✅ State machine (LOBBY → OPEN → PAUSED → CLEARED → ARCHIVED)
- ✅ Evidence discovery and investigation mechanics
- ✅ Interrogation with hybrid AI narrative
- ✅ Contradiction discovery and confrontation
- ✅ Proof graph evaluation
- ✅ Accusation and scoring system
- ✅ Concurrent action handling

### Golden Case Test
- ✅ Full gameplay flow verified: OPEN → investigate → evidence → interrogate → confront → proof → accusation → SOLVED

---

## 2. API LAYER — 🔴 NOT YET IMPLEMENTED

### Required Functions (4 Target)
```
/api/telegram.ts    - Webhook handler for Telegram updates
/api/admin.ts       - Protected admin operations
/api/cron.ts        - Optional: Maintenance and scheduled tasks
/api/health.ts      - Health/readiness checks (stub exists)
```

### Current Status
- ✅ health.ts — functional
- ❌ telegram.ts — stub only
- ❌ admin.ts — stub only
- ❌ cron.ts — stub only

### Implementation Requirements

#### /api/telegram.ts
Must handle:
```typescript
interface TelegramUpdate {
  update_id: number;
  message?: { /* ... */ };
  callback_query?: { /* ... */ };
}
```

**Pipeline**:
1. Validate webhook secret from `X-Telegram-Bot-API-Secret-Token` header
2. Verify `update_id` is not duplicate (idempotency)
3. Extract user/chat identity
4. Route to appropriate command handler:
   - `/start` → mulai sesi
   - callback from buttons → game action
5. Call GameApplicationService
6. Render response and send via Telegram API

**Authorization**:
- Group membership validation
- Spectator mutation rejection
- Detective eligibility check

**Error Handling**:
- Malformed JSON → ignore
- Duplicate update_id → return cached response
- Firestore failure → log with correlation ID, attempt retry
- Telegram send failure → log, don't block canonical state

#### /api/admin.ts
Protected operations (server-side authorization required):

```typescript
interface AdminRequest {
  action: 'publishCase' | 'rejectCandidate' | 'inspectSession' | 'forceArchive';
  auth: { token: string; adminId: string };
  payload: { /* action-specific */ };
}
```

**Operations**:
- `publishCase`: Mark CaseVersion as PUBLISHED
- `rejectCandidate`: Move case candidate to rejected state
- `inspectSession`: Fetch full session state (read-only)
- `forceArchive`: Force session to ARCHIVED state
- `regenerateCase`: Trigger case generation if contract exists
- `healthDiagnostic`: System health and quota metrics

**Security**:
- Token validated against environment variable
- Admin role verified from Firestore
- Audit logged for all mutations

#### /api/cron.ts
Optional maintenance endpoint (only if needed for closed beta):

```typescript
interface CronRequest {
  secret: string;
  job: 'cleanExpiredIdempotency' | 'archiveInactive' | 'refreshMetrics';
}
```

**Jobs**:
- **cleanExpiredIdempotency**: Remove idempotency records older than 24 hours
- **archiveInactive**: Mark COLD sessions as ARCHIVED
- **refreshMetrics**: Update diagnostic metrics (non-critical)

**Constraints**:
- Idempotent (safe to call multiple times)
- Bounded execution (no runaway loops)
- Best-effort (failures don't require retry)

---

## 3. INFRASTRUCTURE — ⚠️ PARTIAL

### Firestore Repositories
**Status**: Contracts defined, Firebase adapters needed

#### Required Collections:
```
/sessions/{sessionId}
  └─ Persists: SesiKasus (immutable runtime state)
  
/caseVersions/{versionId}
  └─ Persists: CaseVersion (immutable published snapshots)
  
/groups/{groupId}
  └─ Persists: Grup (group metadata)
  
/players/{playerId}
  └─ Persists: Pemain (player profile, career stats)
  
/idempotencyMarkers/{actionId}
  └─ Persists: MetadataIdempoten (for deduplication)
  
/contributions/{sessionId}/{contributionId}
  └─ Persists: KontribusiPemain (per-player credit tracking)
```

**Key Constraints**:
- No unbounded arrays
- No massive embedded history
- Transactions for critical mutations only
- Read-after-write pattern avoided

### Firestore Indexes
**Required Compound Indexes**:
```
Collection: sessions
  Filters:
    - status = OPEN AND groupId = X
    - lastActivityAt >= Y
    - status IN (OPEN, PAUSED)
  Order: lastActivityAt DESC
  
Collection: groups
  Filters:
    - activeCaseSessionId != null
    
Collection: caseVersions
  Filters:
    - status = PUBLISHED
    - createdAt >= X
  Order: createdAt DESC
```

---

## 4. SECURITY & AUTHORIZATION — ⚠️ PARTIAL

### Telegram Webhook Validation
```typescript
// Required environment variables:
process.env.TELEGRAM_BOT_TOKEN        // e.g., "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
process.env.TELEGRAM_SECRET           // Secret token for webhook validation

// Verify on every request:
const headerToken = request.headers['x-telegram-bot-api-secret-token'];
if (headerToken !== process.env.TELEGRAM_SECRET) {
  return 401 Unauthorized;
}
```

### Authorization Checks

**Group Boundary**:
- User must be member of group to join session
- Cannot access other groups' sessions
- Cross-group mutation attempts → 403 Forbidden

**Detective Eligibility**:
- Max 6 active detectives per session
- Spectators cannot mutate gameplay
- Non-group members cannot `/start`

**Admin Authorization**:
- Admin token in request must match env var
- Verify admin role in Firestore
- Log all admin mutations

### Input Validation
Treat as untrusted:
- Text input (case descriptions, player names)
- Callback data (validate against known button IDs)
- AI output (validate schema before persisting)
- Generated images (verify size, format)

**Rules**:
- Text max 500 chars (unless case content)
- Case content max 50,000 chars
- Arrays max 100 items
- Reject unknown callback IDs
- Reject non-JSON responses from AI

---

## 5. RATE LIMITING — 🔴 NOT YET IMPLEMENTED

### Strategy
Bounded, free-tier friendly, no external Redis required.

### Limits (Per Group)
```typescript
interface RateLimits {
  updatesPerMinute: 20;           // Telegram updates
  actionsPerMinute: 10;            // Gameplay mutations
  interogationPerMinute: 5;        // Interrogation attempts
  accusationsPerSession: 3;        // Total accusations allowed
  hintsPerSession: 5;              // Total hints per session
}
```

### Implementation
**Option A** (Recommended for free tier):
- Track in Firestore with server timestamp
- Query last N actions from session
- Count within window, reject if exceeded
- Clean old records in cron job

**Option B** (If needing strict per-instance limits):
- In-memory counter per serverless invocation
- Best-effort (per-instance, not global)
- Document as "not guaranteed strict"

### Error Response
```json
{
  "status": 429,
  "error": "RATE_LIMITED",
  "retryAfter": 60,
  "message": "Terlalu banyak permintaan. Coba lagi dalam 60 detik."
}
```

---

## 6. OBSERVABILITY & STRUCTURED LOGGING — 🔴 NOT YET IMPLEMENTED

### Structured Log Format
Every log entry includes:
```typescript
interface StructuredLog {
  timestamp: ISO8601;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  correlationId: UUID;              // Shared across request pipeline
  eventId?: string;                 // For domain events
  sessionId?: string;
  userId?: string;
  groupId?: string;
  action: string;                   // e.g., "INVESTIGATE_SCENE", "ACCUSE"
  duration?: number;                // milliseconds
  result: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  metadata?: Record<string, any>;
}
```

### Log Categories
- **INFO**: Normal gameplay actions
- **WARN**: Recoverable errors, rate limit hits
- **ERROR**: Unrecoverable failures, Firestore issues
- **SECURITY**: Authorization failures, invalid tokens, suspicious input

### Metrics to Track
```
// Counters
telegram.updates.received
telegram.updates.processed
telegram.updates.duplicate
gameplay.actions.success
gameplay.actions.rejected
game.accusations.made
game.solve.success
game.solve.failure
ai.requests.sent
ai.requests.failed
firestore.reads
firestore.writes
firestore.conflicts

// Durations (percentiles)
api.telegram.latency
api.admin.latency
firestore.transaction.latency
ai.generation.latency
telegram.send.latency
```

### Implementation
```typescript
class StructuredLogger {
  log(level: string, action: string, data: LogData): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: getCurrentCorrelationId(),
      ...data,
    };
    
    // Send to:
    // - Console for local dev
    // - Cloud Logging for production
    // - OpenTelemetry compatible format
    console.log(JSON.stringify(entry));
  }
}
```

---

## 7. ERROR TAXONOMY & RECOVERY — ⚠️ PARTIAL

### Typed Domain Errors
```typescript
type KesalahanDomain =
  | KesalahanValidasi              // Input validation failed
  | KesalahanAutorisasi            // User lacks permission
  | KesalahanTidakDitemukan        // Resource not found
  | KesalahanKonflik               // Concurrent mutation conflict
  | KesalahanIdempoten             // Duplicate action
  | KesalahanInfrastruktur         // Database/service error
  | KesalahanProviderEksterna      // AI/Telegram API failure
  | KesalahanKegagalanAI           // AI response doesn't match contract
```

### Recovery Strategies

**Firestore Success + Telegram Send Failure**:
```typescript
// Canonical state is committed
// Game knows action succeeded
// UI may not receive notification
// → Log with sessionId, user can query session state
```

**Firestore Conflict (Concurrent Accusation)**:
```typescript
// Both queries run, one wins via transaction
// Loser gets KesalahanKonflik
// → Retry allowed only for specific actions
```

**AI Response Invalid**:
```typescript
// AI violated semantic contract
// Do NOT persist to CaseVersion
// → Use deterministic fallback narrative
// → Log with actionId for investigation
```

**Duplicate Telegram Update**:
```typescript
// update_id already processed
// Check idempotency marker
// → Return cached response from previous execution
// → Do NOT re-execute logic
```

---

## 8. FIRESTORE OPTIMIZATION — ⚠️ NEEDS REVIEW

### Document Size Audit
```
SesiKasus:
  ├─ Required fields: ~2KB
  ├─ Evidence list (100 items): ~3KB
  ├─ Player IDs (6 items): <1KB
  ├─ Timeline events (50 items): ~2KB
  └─ Total: ~8KB (well under 1MB limit) ✅

CaseVersion:
  ├─ Metadata: ~1KB
  ├─ Case Bible (full): ~20KB (large but acceptable)
  ├─ Proof graph: ~5KB
  └─ Total: ~26KB ✅

Contribution (per-player):
  ├─ Fields: ~500B each
  └─ Total for 6 players: ~3KB ✅
```

### Query Optimization
- No N+1 queries (session + per-evidence queries)
- Batch Firestore operations where possible
- Use collection groups sparingly
- Index compound queries (see section 3)

### Write Patterns
- **Critical mutation**: Wrap in transaction
- **Side effect**: Separate write after commit
- **Idempotency**: Check before write, log action ID
- **Cleanup**: Lazy delete in cron or on-demand

---

## 9. VERCEL FUNCTION COUNT — ⚠️ REQUIRES VERIFICATION

### Hard Constraint
```
Maximum deployed functions: 12
Target deployed functions: 4
```

### Verification Steps
```bash
# Build and check function count
npm run build
ls -la .vercel/output/functions/api/

# Expected:
#   health.ts
#   telegram.ts
#   admin.ts
#   cron.ts (optional)

# Verify no other top-level /api files generated
```

### Risk: Accidental Function Generation
- Framework-based routing can create extra functions
- Check build output after every deployment
- If count > 4, audit source imports

---

## 10. E2E TEST REQUIREMENTS — 🔴 NOT YET IMPLEMENTED

### Golden Path Test
```gherkin
Scenario: Complete case from start to resolution
  Given a group with 3 players
  When player 1 /starts the case
  Then session transitions LOBBY → OPEN
  
  When players investigate scenes
  Then evidence discovered and added to session
  
  When players interrogate suspect
  Then dialogue unlocks
  
  When players build theory
  And players accuse suspect
  Then game evaluates verdict
  And session transitions CLEARED
  And resolution displayed
```

### Multiplayer Concurrent Test
```gherkin
Scenario: Concurrent actions don't duplicate reward
  Given a session with 2 players
  When player 1 inspects object A at 12:00:00.000
  And player 2 inspects object A at 12:00:00.001
  Then evidence discovered once
  And both players see discovery
  And score awarded once
```

### Failure Path Test
```gherkin
Scenario: Wrong accusation ends session
  Given a session in OPEN state
  When player accuses wrong suspect
  Then session transitions CLEARED with outcome FAILED
  And no retry allowed
```

### Security Test
```gherkin
Scenario: Spectator cannot mutate
  Given a spectator in session
  When spectator attempts to accuse
  Then receives 403 Forbidden
  And session state unchanged
  
Scenario: Duplicate Telegram update
  Given update_id = 123 already processed
  When Telegram resends update 123
  Then system returns cached response
  And session state unchanged
```

---

## 11. ENVIRONMENT VARIABLES — ⚠️ CONFIGURATION NEEDED

### Required for Deployment
```bash
# Telegram
TELEGRAM_BOT_TOKEN="123456:ABCDefghIJklmnoPQRstuvWXYZ"
TELEGRAM_SECRET="your-secret-webhook-token"

# Firebase / Firestore
FIREBASE_PROJECT_ID="detective-telegram-dev"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@appspot.gserviceaccount.com"

# Admin Operations
ADMIN_SECRET_TOKEN="random-secret-for-admin-ops"

# Optional: AI Provider
AI_PROVIDER="openai"  # or "anthropic", "gemini", "fake"
AI_MODEL="gpt-4"
OPENAI_API_KEY="sk-..." (if provider = openai)

# Optional: Logging
LOG_LEVEL="info"  # "debug", "info", "warn", "error"
```

### Local Development (.env.local)
```bash
TELEGRAM_BOT_TOKEN="test-token"
TELEGRAM_SECRET="test-secret"
FIREBASE_PROJECT_ID="detective-telegram-dev"
ADMIN_SECRET_TOKEN="dev-admin-secret"
AI_PROVIDER="fake"
LOG_LEVEL="debug"
```

---

## 12. DEPLOYMENT STEPS — BEFORE BETA LAUNCH

### Prerequisites
1. Telegram bot created via @BotFather
2. Firebase project created and Firestore initialized
3. Vercel project linked
4. Service account JSON downloaded from Firebase
5. Indexes created in Firestore (see section 3)

### Vercel Deployment
```bash
# 1. Install dependencies
npm install

# 2. Set environment variables in Vercel dashboard
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_SECRET
vercel env add FIREBASE_PROJECT_ID
# ... etc

# 3. Deploy
vercel deploy --prod

# 4. Verify function count
curl https://your-project.vercel.app/api/health
# Should return 200 OK

# 5. Set Telegram webhook
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET"

# 6. Run smoke test
npm run test:smoke
```

### Rollback Procedure
```bash
# If issues detected:
# 1. Disable webhook immediately
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook

# 2. Revert to previous Vercel deployment
vercel rollback

# 3. Fix issues locally
# 4. Re-deploy
```

---

## 13. SMOKE TEST — QUICK VALIDATION

### Manual Smoke Test (5 min)
```
1. Send /start to bot group chat
   → Bot responds with case selection
   
2. Select case
   → Session created, status LOBBY
   
3. Join as second player
   → Player added to playerIds
   
4. /investigate command
   → Scene displayed, objects listed
   
5. Click inspect object button
   → Evidence discovered (if applicable)
   
6. Click accuse button
   → Accusation dialog shown
   
7. Submit wrong accusation
   → Session ends with CLEARED/FAILED
   
8. Start new case
   → New session created for same group
```

### Automated Smoke Test (Script)
```bash
npm run test:smoke

# Runs:
# - Create session
# - Join players
# - Perform investigation
# - Submit accusation
# - Verify state transitions
# - Clean up test data
```

---

## 14. KNOWN LIMITATIONS — FOR CLOSED BETA

### Current Constraints
1. **Single Group Only**: Designed for one Telegram group
2. **One Active Session Per Group**: No queue or multi-session support
3. **No Persistent Spectators**: Spectators see state but cannot join mid-session
4. **Deterministic AI Only**: Real AI providers not yet integrated
5. **No Undo Mechanics**: Actions are final
6. **No Custom Cases**: Admin only (user case submission not included)
7. **No Analytics Dashboard**: Metrics available via logs only

### Scaling for Open Beta
- Add namespace/tenant isolation
- Implement game queue system
- Add case browser and filtering
- Integrate real AI providers
- Add user-submitted case moderation

---

## 15. MONITORING & ALERTS — PRODUCTION READINESS

### Critical Metrics
```
Availability: > 99%
Incident Response Time: < 5 min
Case Completion Rate: > 80%
Error Rate: < 1%
```

### Monitoring Setup
```typescript
// Log all critical events
- Session created/archived
- Accusation submitted
- Gameplay errors
- API errors (4xx, 5xx)
- Firestore transaction conflicts
- AI generation failures
```

### Alert Thresholds
- Error rate > 5% in 5-min window
- Firestore quota exceeded
- Telegram API down (429/500)
- Health check failing

---

## 16. SECURITY AUDIT CHECKLIST

- [ ] No secrets in repository (run `git grep -i token`)
- [ ] Firestore security rules restrict to authenticated users
- [ ] Webhook token not printed in logs
- [ ] AI prompts don't leak internal structure
- [ ] User input validated before AI/database
- [ ] Admin operations require token verification
- [ ] Spectator authorization enforced on every mutation
- [ ] Duplicate detection prevents reward duplication
- [ ] Correlation IDs logged for tracing
- [ ] No sensitive data in error messages

---

## 17. NEXT STEPS FOR IMPLEMENTATION

### Phase 1: Infrastructure (1-2 days)
1. Create Firestore repositories (session, group, player, case)
2. Implement Firestore transaction patterns
3. Set up indexes
4. Verify free-tier quota assumptions

### Phase 2: API Layer (2-3 days)
1. Implement /api/telegram.ts webhook handler
2. Implement /api/admin.ts protected operations
3. Add idempotency tracking
4. Add error handling and logging

### Phase 3: Security & Observability (1-2 days)
1. Add authorization middleware
2. Implement rate limiting
3. Add structured logging
4. Add correlation ID tracking

### Phase 4: Testing & Hardening (1-2 days)
1. Create E2E tests
2. Run security audit
3. Load test rate limiting
4. Verify function count

### Phase 5: Deployment (1 day)
1. Set up Vercel environment
2. Deploy to staging
3. Run full smoke test
4. Deploy to production

---

## 18. REFERENCE DOCUMENTS

**See Also**:
- `docs/26-coding-baseline.md` — Domain architecture and contracts
- `docs/21-runtime-contract.md` — Function budget and request pipeline
- `docs/23-security-moderation-contract.md` — Security and moderation gates
- `docs/24-observability-testing-deployment.md` — Testing and deployment
- `docs/IMPLEMENTATION-MAP.md` — Detailed implementation roadmap

---

## Approval & Sign-Off

**Milestone 9 — Final Beta Hardening & Release Readiness**

- [ ] Domain layer verified
- [ ] API handlers implemented
- [ ] Security audit passed
- [ ] E2E tests passing
- [ ] Deployment checklist complete
- [ ] Documentation finalized
- [ ] Ready for beta launch

**Status**: In Progress  
**Target Date**: 2026-09-15  
**Owner**: Development Team
