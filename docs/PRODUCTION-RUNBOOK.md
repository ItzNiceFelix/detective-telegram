# Production Runbook — Detective Telegram

**Purpose**: Emergency procedures and operational playbooks for production deployments  
**Audience**: DevOps, SRE, on-call engineers  
**Last Updated**: 2026-09-01

---

## 1. DEPLOYMENT

### Standard Deployment Flow
```bash
# 1. Verify no uncommitted changes
git status

# 2. Run full test suite locally
npm run typecheck
npm run test

# 3. Check function count
npm run build
ls -la .vercel/output/functions/api/
# Should show exactly 4 functions

# 4. Deploy to Vercel staging
vercel deploy

# 5. Run smoke test (offline Production Smoke: /start → /newcase → /status → /startcase)
npm run smoke

# 6. Run smoke test on staging
npm run test:smoke -- --url https://staging.your-project.vercel.app

# 7. Deploy to production
vercel deploy --prod

# 8. Verify production deployment
curl https://your-project.vercel.app/api/health

# 9. Test webhook with sample update
curl -X POST https://your-project.vercel.app/api/telegram \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-API-Secret-Token: $TELEGRAM_SECRET" \
  -d '{"update_id": 999, "message": {"chat": {"id": -123}, "text": "/help"}}'
```

### Production Smoke (offline)

`npm run smoke` menjalankan `tests/smoke-production.ts` — memvalidasi wiring produksi untuk
4 perintah inti TANPA AI, TANPA jaringan nyata, TANPA endpoint baru:

- `/start` — outbound `sendMessage` + pendaftaran grup (create-if-missing).
- `/newcase` — satu sesi `LOBBY` + pointer `groups/{id}.activeCaseSessionId` + event
  `CASE_SESSION_CREATED` atomic dalam transaction yang sama + kunci idempotensi.
- `/status` — read-only, tidak memproduksi mutasi.
- `/startcase` — `LOBBY → OPEN` + tepat satu `CASE_STARTED`; duplicate delivery
  di-replay secara idempotent (tanpa mutasi kedua).

Sumber content: published **Golden Case fixture** (`src/kasus/fixtures/golden-case.ts`).
Firestore dan Telegram memakai fake in-memory (semantik transaction Firestore SDK);
composition root (`src/komposisi/komposisi-aplikasi.ts`) adalah modul produksi asli.

### Rollback Procedure
```bash
# If critical issues detected after deployment:

# 1. IMMEDIATE: Disable webhook
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook

# 2. Revert to previous Vercel deployment
# Option A: Via CLI
vercel rollback

# Option B: Via Dashboard
# → Vercel Dashboard → Deployments → Previous → Promote to Production

# 3. Verify previous version is live
curl https://your-project.vercel.app/api/health

# 4. Post-mortem
# - Identify issue
# - Fix locally
# - Re-deploy with fix
```

---

## 2. INCIDENT RESPONSE

### Alert: High Error Rate (>5% in 5 min)
```
RESPONSE:
1. Check Vercel logs
   → https://vercel.com/project/logs

2. Identify error pattern
   - API errors (Telegram.ts)?
   - Firestore errors?
   - AI provider errors?

3. Immediate action by error type:

   a) Telegram API Down
      - Vercel will queue updates
      - No action required
      - Monitor telegram.com status

   b) Firestore Quota Exceeded
      - Contact Firebase support
      - Temporarily reduce write operations if possible
      - Consider upgrading Firestore plan

   c) AI Provider Error
      - Check AI provider status
      - Switch to fallback AI provider if available
      - Use deterministic responses

   d) Application Error (bug)
      - Disable webhook (step 1 above)
      - Roll back deployment
      - Fix and re-deploy
```

### Alert: Webhook Timeouts
```
SYMPTOMS:
- Telegram: "Bot didn't respond to the callback query in time"
- Logs: No response logged after 30 seconds

ROOT CAUSES:
1. Firestore transaction taking too long
2. AI generation taking > 30 seconds
3. Vercel cold start + heavy computation

RESPONSE:
1. Check specific session logs
   - Get correlationId from Telegram callback
   - Query: correlation.id = X in logs
   
2. Identify bottleneck
   - If Firestore: check transaction contention
   - If AI: check AI provider latency
   - If startup: add provisioning concurrency

3. Optimize
   - Move long operations out of critical path
   - Use caching for AI responses
   - Increase Vercel provisioning

4. If urgent: temporarily increase timeout
   - Update telegram.ts error handling
   - Return immediate ack, process async
```

### Alert: Duplicate Sessions Created
```
SYMPTOMS:
- Multiple SesiKasus with same group + case combination
- Players report joining same case multiple times

ROOT CAUSE:
- Idempotency check failed or was bypassed
- update_id collision or timestamp-based dedup broke

RESPONSE:
1. Check /api/telegram logs for duplicate update_ids
   - Filter: level = ERROR AND eventId = DUPLICATE_HANDLE

2. Query affected sessions
   - Firestore: groupId = X AND createdAt > Y

3. Manual intervention
   - Inspect each session state
   - Keep first session (earliest createdAt)
   - Archive duplicates: force_state = ARCHIVED

4. Verify idempotency
   - Check /api/cron ran cleanExpiredIdempotency recently
   - If cleaned too aggressively, adjust TTL

5. Prevent recurrence
   - Add alerting on duplicate update_id detections
```

### Alert: Players Can't Join / Authorization Error
```
SYMPTOMS:
- New players get "Anda bukan anggota grup ini"
- Even group members rejected

ROOT CAUSE:
1. Cache stale (group membership changed)
2. Authorization check is wrong
3. Firestore group document missing

RESPONSE:
1. Verify group document exists
   db.collection('groups').doc(groupId).get()
   
2. If missing, recreate
   - Query /sessions for groupId
   - Extract from first session
   - Recreate group document with current members
   
3. If exists, verify members list
   - Check Firestore group.memberIds
   - Compare with actual Telegram members
   - Update if stale
   
4. Clear any in-memory caches
   - Restart Vercel (redeploy)
   
5. Monitor
   - Add logging for member validation
```

### Alert: Firestore Transaction Conflicts (429/5xx)
```
SYMPTOMS:
- "Error: 7 PERMISSION_DENIED: Transaction aborted"
- Or: "Error: DEADLINE_EXCEEDED"
- Logs: many failed transaction attempts

ROOT CAUSE:
1. Hot document (high contention)
   - Multiple players mutating same session
   - All retrying against same doc
   
2. Firestore overloaded
   - Too many writes in short window
   - Check quota usage

3. Transaction too large
   - Reading/writing too many docs

RESPONSE:
1. For high contention
   - Reduce transaction scope
   - Move player-specific updates outside transaction
   - Use exponential backoff + jitter in retries
   
2. For quota exceeded
   - Wait for quota reset (daily at UTC midnight)
   - Consider upgrading Firestore plan
   - Reduce logging writes (move to application logs)
   
3. Verify transaction is minimal
   - Should only include session read + write
   - Avoid reading case content in transaction
   - Avoid fetching player profiles in transaction
```

---

## 3. WEBHOOK MANAGEMENT

### Health Check
```bash
# Verify webhook is registered
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo | jq

# Expected response:
{
  "ok": true,
  "result": {
    "url": "https://your-project.vercel.app/api/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "last_error_message": "",
    "last_synchronization_unixtime": 0
  }
}
```

### Disable Webhook (Emergency)
```bash
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook

# Expected response: {"ok": true, "result": true}
```

### Re-Register Webhook
```bash
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET" \
  -d allowed_updates='["message", "callback_query"]'

# Expected response: {"ok": true, "result": true}
```

### Clear Pending Updates (if stuck)
```bash
# This will drop all queued updates (use only in emergency)
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook?drop_pending_updates=true
```

---

## 4. FIRESTORE INCIDENT RECOVERY

### Session Data Corruption (Wrong State)
```
SCENARIO: Session stuck in PAUSED state, won't transition

DIAGNOSIS:
1. Query session document
   db.collection('sessions').doc(sessionId).get()
   
2. Check status field
   - Should be one of: LOBBY, OPEN, PAUSED, CLEARED, ARCHIVED
   
3. Check lastActivityAt
   - Should be recent if active

RECOVERY:
1. If evidence/score corrupt
   - Read CaseVersion (immutable source of truth)
   - Recalculate discovery based on examinedObjectIds
   - Update discoveredEvidenceIds

2. If state corrupt
   - Determine intended state from context
   - Update status field
   - DO NOT modify other fields
   - Log change with reason

3. If entire session corrupt
   - Backup corrupt data (save to archive collection)
   - Delete session
   - Create new session from scratch
```

### Quota Exceeded (No More Writes)
```
SCENARIO: All write operations fail with quota error

SYMPTOMS:
- Error: "Resource exhausted"
- Firestore dashboard shows quota at 100%

RESPONSE:
1. Identify quota type
   - Stored data
   - Write operations
   - Read operations
   - Network bandwidth

2. Immediate mitigation
   - Reduce logging writes (only critical events)
   - Batch read operations
   - Defer non-critical writes

3. Long-term fix
   - Upgrade Firestore plan to "Blaze" (pay-as-you-go)
   - Optimize queries (add missing indexes)
   - Clean up old data (archive/delete)

4. Prevent recurrence
   - Set up Firestore alerting for quota usage
   - Monitor usage trends
```

---

## 5. AI PROVIDER FAILURE HANDLING

### Scenario: AI Provider Returns Invalid Response
```
SYMPTOMS:
- AI response doesn't match contract
- Missing required fields
- Invalid JSON

ROOT CAUSE:
- Provider changed response format
- Provider error (returning error message as content)
- Network corruption

RESPONSE:
1. Check AI logs for response
   - Correlate by requestId
   - Save exact response for debugging

2. Immediate fallback
   - Use deterministic response based on game state
   - Do NOT persist invalid response

3. If recurring
   - Switch to fallback provider
   - Contact primary provider support

4. Prevent recurrence
   - Add response validation tests
   - Verify contract weekly with provider
```

### Scenario: AI Generation Takes > 30 Seconds
```
SYMPTOMS:
- Telegram: "Bot didn't respond in time"
- Player sees timeout error

ROOT CAUSE:
- AI provider slow
- Large case content
- Vercel cold start

RESPONSE:
1. For immediate game
   - Return timeout message
   - Queue generation for background job
   - Let player continue with fallback

2. For long-term
   - Reduce case complexity passed to AI
   - Cache AI responses (same prompt = same response)
   - Pre-warm Vercel (provisioning concurrency)

3. Architecture change
   - Move AI to separate async handler
   - Don't block game response on AI completion
```

---

## 6. TELEGRAM API ISSUES

### Scenario: Telegram API Down (5xx Errors)
```
SYMPTOMS:
- All curl requests to api.telegram.org return 500+
- Logs show repeated failures

RESPONSE:
1. Check status
   - Visit https://telegram.org/status
   - Check status page for API issues

2. Expected behavior
   - Vercel will queue webhook updates
   - Updates will be delivered once API recovers
   - No data loss

3. During outage
   - Game logic still works (Firestore OK)
   - Players won't see Telegram responses
   - Session state updates normally

4. After recovery
   - Telegram will requeue messages
   - Monitor that no duplicates occur
   - Verify idempotency handling worked
```

### Scenario: Telegram Rate Limiting (429)
```
SYMPTOMS:
- Errors: "429 Too Many Requests"
- Logs: repeated send failures

ROOT CAUSE:
- Sending too many messages to same chat
- Telegram's per-account rate limit exceeded

RESPONSE:
1. Add backoff
   - Implement exponential backoff for retries
   - Space out messages if possible

2. Batch messages
   - Instead of 5 separate messages
   - Combine into 1-2 messages with button groups

3. Check for leaks
   - Are we resending messages on every state update?
   - Only send on state change, not on every read

4. Monitor
   - Log all send attempts and failures
   - Alert on repeated 429 errors
```

---

## 7. MONITORING & OBSERVABILITY

### Log Query Examples

**Find all errors in last hour**:
```
severity = ERROR AND timestamp >= now - 1h
```

**Find specific session issues**:
```
sessionId = "session-xyz" AND level IN (ERROR, WARN)
```

**Find authorization failures**:
```
action = "AUTHORIZE" AND result = "FAILURE" AND timestamp >= now - 1h
```

**Find AI failures**:
```
source = "AI" AND result = "FAILURE" 
```

**Find duplicate updates**:
```
eventId = "DUPLICATE_UPDATE" AND timestamp >= now - 24h
```

### Key Metrics to Monitor

```
Real-time:
- Active sessions (count)
- Players online (count)
- Recent errors (last 5 min)
- API latency (p50, p99)

Daily:
- Case completion rate
- Accusation accuracy
- Error rate
- Firestore quota used
- Function invocation count

Weekly:
- Player retention
- Game difficulty feedback
- Bug reports
- Performance trends
```

---

## 8. FEATURE TOGGLES / EMERGENCY DISABLE

### Disable Specific Features (if bugs found)
```typescript
// In configuration, add feature flags:
const FEATURE_FLAGS = {
  AI_GENERATION: process.env.FEATURE_AI === 'true',  // default: true
  ACCUSATION: process.env.FEATURE_ACCUSATION === 'true',  // default: true
  INTERROGATION: process.env.FEATURE_INTERROGATION === 'true',  // default: true
};

// In handlers, check:
if (!FEATURE_FLAGS.ACCUSATION) {
  return { error: 'Feature temporarily disabled' };
}
```

### Emergency Disable via Environment
```bash
# Disable accusation temporarily
vercel env add FEATURE_ACCUSATION false
vercel deploy --prod

# Re-enable
vercel env remove FEATURE_ACCUSATION
vercel deploy --prod
```

---

## 9. DATA RECOVERY & BACKUPS

### Backup Strategy
```
Firestore automatic backups:
- Daily full backup retained for 35 days
- Available via Firestore console

Manual backup (recommended weekly):
gcloud firestore export gs://detective-telegram-backups/daily-$(date +%s)

Restore procedure:
1. Stop production webhook
2. Import from backup
3. Verify data integrity
4. Resume webhook
```

### Corruption Recovery

**If session document corrupted**:
```typescript
// Restore from backup without affecting others
const backup = await getBackupSession(sessionId, timestamp);
await db.collection('sessions').doc(sessionId).set(backup);
```

**If multiple sessions corrupted**:
```bash
# Restore entire /sessions collection from backup
# Via Firestore console:
# Firestore → Backups → Choose backup → Restore
```

---

## 10. CAPACITY PLANNING

### Free Tier Limits
```
Firestore:
- 50,000 reads/day (limit: ~35/min average)
- 20,000 writes/day (limit: ~14/min average)
- 1GB stored data

Vercel:
- 6.2 million executions/month (~144 per hour)
- 50 GB bandwidth/month

Expected usage (100 concurrent groups):
- Telegram update: 1 read + 1 write per action
- 3 actions/player/hour * 6 players * 100 groups
- = 1,800 reads + 1,800 writes/hour
- = ~430K reads/day, ~430K writes/day ❌ EXCEEDS QUOTA
```

### Quota Exceeded Scenario
```
If approaching quota:
1. Upgrade to Blaze (pay-as-you-go)
2. Optimize query patterns
3. Implement caching
4. Reduce logging verbosity
5. Archive old game sessions
```

---

## 11. SECURITY INCIDENTS

### Suspect: Unauthorized Access / Cross-Group Access
```
INVESTIGATION:
1. Check authorization logs
   - Filter: eventId = "AUTHORIZE_FAILED"
   - Check: which sessionId, which userId, which groupId

2. Verify group membership
   - Query: groups.memberIds.includes(userId)

3. Check session access logs
   - Correlate sessionId mutations with userId

RESPONSE:
If breach confirmed:
1. Suspend suspicious account
2. Review all mutations by user
3. Audit affected sessions
4. Notify affected players
5. Implement additional audit logging
```

### Suspect: Prompt Injection / AI Jailbreak
```
INVESTIGATION:
1. Check player text inputs for suspicious patterns
   - Queries with unusual keywords
   - Multi-line prompts (unusual)
   - Repeated variations of same idea

2. Check AI outputs
   - Does response match expected schema?
   - Does response expose system prompts?
   - Does response answer unsafe questions?

RESPONSE:
If jailbreak confirmed:
1. Disable AI temporarily
2. Revert to deterministic responses
3. Audit all AI responses for damage
4. Re-engineer prompt guards
5. Add input sanitization
```

---

## 12. COMMUNICATION & ESCALATION

### On-Call Escalation Path
```
Level 1: Automated alerts (check logs, resolve if obvious)
    ↓
Level 2: On-call engineer (1-2 min response)
    ↓
Level 3: Team lead (issues escalating to Level 2)
    ↓
Level 4: Manager/Director (for major incidents)
```

### Player Communication
```
INCIDENT:            | MESSAGE
API down (< 10 min)  | None (usually don't notice)
Downtime (10-60 min) | "Bot sedang maintenance, sebentar lagi kembali"
Corruption/Data loss | "Kami menemukan error. Sesi Anda di-reset. Maaf!"
Feature disabled     | "Fitur X sedang diperbaiki, coba lagi nanti"
```

---

## 13. MAINTENANCE WINDOWS

### Scheduled Maintenance
```
Windows (avoid peak hours):
- Tuesday 10:00-11:00 UTC
- Thursday 22:00-23:00 UTC

Announcement (24h before):
"Maintenance terjadwal: [time window]. Game akan tidak tersedia selama ~15 menit."

Steps:
1. Announce in group chats
2. Disable webhook (deleteWebhook)
3. Perform maintenance
4. Test thoroughly
5. Re-enable webhook (setWebhook)
6. Monitor for issues
```

### Emergency Maintenance
```
If critical security or data issue:
1. Immediately disable webhook
2. Announce: "Bot sedang offline karena emergency. Terima kasih atas kesabaran!"
3. Fix issue
4. Deploy
5. Re-enable webhook
6. Post-mortem within 24h
```

---

## 14. CONTACT LIST & ESCALATION

```
On-Call Engineer
  Phone: +...
  Slack: @oncall
  
Technical Lead
  Slack: @tech-lead
  
Firebase Support
  Dashboard: firebase.google.com/support
  
Telegram Bot Support
  Contact: support@telegram.org
  
Vercel Support
  Dashboard: vercel.com/support
```

---

## Quick Reference — Common Commands

```bash
# Check system health
curl https://your-project.vercel.app/api/health

# Disable webhook (emergency)
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook

# Re-enable webhook
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET"

# Verify webhook registered
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo

# Rollback deployment
vercel rollback

# Check function count
ls -la .vercel/output/functions/api/

# Query Firestore (via gcloud)
gcloud firestore documents list --collection-id=sessions

# View logs
gcloud functions logs read telegram-bot --limit 50
```

---

**Last Updated**: 2026-09-01  
**Version**: 1.0
