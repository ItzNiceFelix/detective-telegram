# Environment Variables Setup Guide — Detective Telegram

**Purpose**: Complete step-by-step instructions for obtaining and configuring all environment variables  
**Audience**: Developers deploying to Vercel or running locally  
**Last Updated**: 2026-09-01

---

## Quick Reference

| Variable | Required | Source | Type |
|----------|----------|--------|------|
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | @BotFather | String |
| `TELEGRAM_SECRET` | ✅ Yes | Generated | String |
| `FIREBASE_PROJECT_ID` | ✅ Yes | Firebase Console | String |
| `FIREBASE_PRIVATE_KEY` | ✅ Yes | Firebase Service Account | String |
| `FIREBASE_CLIENT_EMAIL` | ✅ Yes | Firebase Service Account | String |
| `ADMIN_SECRET_TOKEN` | ✅ Yes | Generated | String |
| `AI_PROVIDER` | ⚠️ Optional | Chosen by you | String |
| `OPENAI_API_KEY` | ⚠️ If OpenAI | OpenAI Console | String |
| `ANTHROPIC_API_KEY` | ⚠️ If Anthropic | Anthropic Console | String |
| `GOOGLE_GEMINI_API_KEY` | ⚠️ If Gemini | Google AI Studio | String |
| `LOG_LEVEL` | ⚠️ Optional | Chosen by you | String |
| `NODE_ENV` | ⚠️ Optional | Chosen by you | String |
| `RATE_LIMIT_MAX_ACTIONS` | ⚠️ Optional | Chosen by you | Number |
| `RATE_LIMIT_WINDOW_SECONDS` | ⚠️ Optional | Chosen by you | Number |
| `ENABLE_CRON_JOBS` | ⚠️ Optional | Chosen by you | Boolean |
| `ENABLE_ERROR_STACK_TRACES` | ⚠️ Optional | Chosen by you | Boolean |

---

## § 1. TELEGRAM BOT SETUP

### Step 1.1: Create Bot via @BotFather

1. Open Telegram and search for **@BotFather**
2. Start a chat with BotFather
3. Send: `/newbot`
4. BotFather asks for bot name: `Detective Detective Bot` (or your preferred name)
5. BotFather asks for bot username: Must be unique, end with `_bot`
   - Example: `detective_telegram_bot` or `your_username_detective_bot`
6. **BotFather responds with**:
   ```
   Done! Congratulations on your new bot. You will find it at t.me/YOUR_BOT_USERNAME.
   You can now add a description, about section and profile picture for your bot, 
   see /help for a list of commands.
   
   Use this token to access the HTTP API:
   123456:ABCDefghIJklmnoPQRstuvWXYZ1234567890ABC
   ```

### Step 1.2: Save the Bot Token

The token format is: `{BOT_ID}:{BOT_TOKEN}`

**Example**:
```
123456:ABCDefghIJklmnoPQRstuvWXYZ1234567890ABC
```

**Store as**:
```bash
TELEGRAM_BOT_TOKEN=123456:ABCDefghIJklmnoPQRstuvWXYZ1234567890ABC
```

⚠️ **SECURITY WARNING**: This token is like a password for your bot. Never commit it to git. Keep it secret.

### Step 1.3: Configure Bot with BotFather (Optional but Recommended)

In BotFather chat, send:

```
/setdescription
```

Then select your bot and provide a description:
```
A multiplayer cooperative detective game for Telegram groups
```

Send:
```
/setabouttext
```

And provide about text:
```
Solve mysteries together with your group. Investigate scenes, find evidence, interrogate suspects, and accuse the culprit.
```

---

## § 2. TELEGRAM WEBHOOK SECRET SETUP

### Step 2.1: Generate a Random Secret Token

The webhook secret is used to authenticate incoming Telegram updates to your server.

**On Linux/Mac**:
```bash
openssl rand -hex 32
# Example output: a3f9c8e2b1d7e4f6a9c2b5e8f1d4a7b0c3e6f9a2b5e8f1d4a7b0c3e6f9a2
```

**On Windows PowerShell**:
```powershell
-join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
# or use an online tool: https://random.org/strings/
# You need a 32+ character random string
```

### Step 2.2: Store the Secret

```bash
TELEGRAM_SECRET=a3f9c8e2b1d7e4f6a9c2b5e8f1d4a7b0c3e6f9a2b5e8f1d4a7b0c3e6f9a2
```

This secret is sent with each Telegram webhook update in the header:
```
X-Telegram-Bot-API-Secret-Token: a3f9c8e2b1d7e4f6a9c2b5e8f1d4a7b0c3e6f9a2b5e8f1d4a7b0c3e6f9a2
```

Your `/api/telegram.ts` handler validates this header to ensure updates come from Telegram.

---

## § 3. FIREBASE / FIRESTORE SETUP

### Step 3.1: Create Firebase Project

1. Go to **[Firebase Console](https://console.firebase.google.com/)**
2. Click **"Add project"**
3. Project name: `detective-telegram` or your preferred name
4. **Analytics**: Uncheck (not needed for this project)
5. Click **"Create project"**
6. Wait for project creation (2-3 minutes)

### Step 3.2: Create Firestore Database

1. In Firebase Console, left sidebar click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Location: Choose closest to your users (e.g., `us-central1` or `asia-southeast1`)
4. Security Rules mode: **"Start in test mode"** (we'll secure later)
   - ⚠️ Test mode is only for development. Before production, enable authentication.
5. Click **"Create"**
6. Wait for database creation (1-2 minutes)

### Step 3.3: Create Service Account

1. In Firebase Console, click **⚙️ (gear icon)** → **"Project settings"**
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. A JSON file is downloaded: `detective-telegram-123abc-firebase-adminsdk-xyz123.json`
5. **DO NOT** commit this file to git. Keep it secure.

### Step 3.4: Extract Firebase Credentials from Service Account JSON

Open the downloaded JSON file in a text editor. It looks like:

```json
{
  "type": "service_account",
  "project_id": "detective-telegram-123abc",
  "private_key_id": "abc123def456",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xyz123@detective-telegram-123abc.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  ...
}
```

**Extract these three fields**:

#### `FIREBASE_PROJECT_ID`
Copy the `project_id` field:
```bash
FIREBASE_PROJECT_ID=detective-telegram-123abc
```

#### `FIREBASE_PRIVATE_KEY`
Copy the `private_key` field (entire multiline value):
```bash
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQE...
-----END PRIVATE KEY-----
```

⚠️ **Important**: When pasting into `.env` or Vercel, preserve the newlines. The key contains `\n` characters:
```bash
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG...\n-----END PRIVATE KEY-----\n"
```

#### `FIREBASE_CLIENT_EMAIL`
Copy the `client_email` field:
```bash
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz123@detective-telegram-123abc.iam.gserviceaccount.com
```

### Step 3.5: Set Firestore Security Rules (Optional for Closed Beta)

For closed beta, test mode is acceptable. For production:

1. In Firebase Console, Firestore Database tab, click **"Rules"**
2. Replace default rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all by default
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
3. Click **"Publish"**

In final implementation, authorization checks will be in `src/security/authorization/`.

---

## § 4. ADMIN TOKEN SETUP

### Step 4.1: Generate Admin Secret Token

This token is used to authorize `/api/admin` endpoint calls.

**Generate on Linux/Mac**:
```bash
openssl rand -hex 32
# Example: 7e3a1c5f9b2d8a4e6f1c3b5a8d2e7f1a9c4e6b3a5f8d1c3e5a7b9d2f4a6
```

**Generate on Windows PowerShell**:
```powershell
-join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

### Step 4.2: Store the Token

```bash
ADMIN_SECRET_TOKEN=7e3a1c5f9b2d8a4e6f1c3b5a8d2e7f1a9c4e6b3a5f8d1c3e5a7b9d2f4a6
```

This token is used when calling `/api/admin` operations:
```bash
curl -X POST https://your-project.vercel.app/api/admin \
  -H "Content-Type: application/json" \
  -d '{
    "action": "publishCase",
    "auth": {
      "token": "7e3a1c5f9b2d8a4e6f1c3b5a8d2e7f1a9c4e6b3a5f8d1c3e5a7b9d2f4a6"
    },
    ...
  }'
```

---

## § 5. AI PROVIDER SETUP

### § 5.1: Choosing an AI Provider

For **closed beta**, we recommend:
- **`AI_PROVIDER=fake`** — No API key needed, generates placeholder content
- Best for testing without incurring costs

For **open beta**, choose one:
- **OpenAI**: GPT-4 (best quality, highest cost)
- **Anthropic**: Claude 3 (excellent reasoning, moderate cost)
- **Google Gemini**: Gemini 1.5 Pro (good balance, moderate cost)

### § 5.2: Fake Provider (Recommended for Closed Beta)

```bash
AI_PROVIDER=fake
AI_MODEL=fake-model
# No API key needed
```

### § 5.3: OpenAI Setup

1. Go to **[OpenAI Platform](https://platform.openai.com/)**
2. Sign up or log in
3. Click profile → **"API keys"** in left sidebar
4. Click **"Create new secret key"**
5. Copy the key (format: `sk-...`)

**Store as**:
```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4
OPENAI_API_KEY=sk-proj-abc123xyz789...
```

**Pricing**: $0.03-0.06 per 1K tokens (varies by model)

### § 5.4: Anthropic Setup

1. Go to **[Anthropic Console](https://console.anthropic.com/)**
2. Sign up or log in
3. Go to **"API Keys"** section
4. Click **"Create Key"**
5. Copy the key (format: `sk-ant-...`)

**Store as**:
```bash
AI_PROVIDER=anthropic
AI_MODEL=claude-3-sonnet-20240229
ANTHROPIC_API_KEY=sk-ant-abc123xyz789...
```

**Pricing**: $0.003-0.015 per 1K tokens

### § 5.5: Google Gemini Setup

1. Go to **[Google AI Studio](https://makersuite.google.com/app/apikey)**
2. Sign in with Google account
3. Click **"Create API Key"**
4. Copy the key (format: `AIza...`)

**Store as**:
```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-1.5-pro
GOOGLE_GEMINI_API_KEY=AIzaSy_...
```

**Pricing**: Free tier available, then $0.00125-0.0075 per 1K tokens

---

## § 6. LOGGING SETUP

### § 6.1: Log Level Configuration

```bash
LOG_LEVEL=info  # or "debug", "warn", "error"
```

**Options**:
- `debug`: Verbose, all events logged (local development)
- `info`: Standard, important events logged (production)
- `warn`: Only warnings and errors logged
- `error`: Only errors logged (minimal output)

**Recommendation**:
- Local development: `debug`
- Staging: `info`
- Production: `warn`

### § 6.2: Environment Designation

```bash
NODE_ENV=local  # or "staging", "production"
```

Used to distinguish logs and disable certain features (like stack traces) in production.

---

## § 7. RATE LIMITING CONFIGURATION

### § 7.1: Rate Limit Thresholds

```bash
RATE_LIMIT_MAX_ACTIONS=30
RATE_LIMIT_WINDOW_SECONDS=60
```

This allows **30 actions per group per 60 seconds** (1 minute).

**Typical usage patterns**:
- `1 action/min`: Very strict, only for preventing abuse
- `10 actions/min`: Reasonable for casual gameplay
- `30 actions/min`: Default, comfortable for active play
- `60+ actions/min`: Aggressive, minimal rate limiting

**For closed beta**, 30 actions/min is recommended.

---

## § 8. CRON CONFIGURATION

### § 8.1: Enable/Disable Cron Jobs

```bash
ENABLE_CRON_JOBS=false  # Set to "true" to enable
```

Cron jobs include:
- Clean expired idempotency markers (>24h old)
- Archive inactive sessions (>7 days)
- Refresh diagnostic metrics

**For closed beta**, keep disabled (not needed yet).

---

## § 9. ERROR HANDLING CONFIGURATION

### § 9.1: Stack Trace Exposure

```bash
ENABLE_ERROR_STACK_TRACES=false  # Set to "true" only for development
```

⚠️ **Security**: Never enable in production. Stack traces can leak implementation details.

---

## § 10. LOCAL DEVELOPMENT SETUP

### Step 10.1: Create .env.local File

1. In project root, copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` and fill in values from sections above:
```bash
TELEGRAM_BOT_TOKEN=123456:ABCDefghIJklmnoPQRstuvWXYZ1234567890ABC
TELEGRAM_SECRET=a3f9c8e2b1d7e4f6a9c2b5e8f1d4a7b0c3e6f9a2b5e8f1d4a7b0c3e6f9a2
FIREBASE_PROJECT_ID=detective-telegram-123abc
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz123@detective-telegram-123abc.iam.gserviceaccount.com
ADMIN_SECRET_TOKEN=7e3a1c5f9b2d8a4e6f1c3b5a8d2e7f1a9c4e6b3a5f8d1c3e5a7b9d2f4a6
AI_PROVIDER=fake
LOG_LEVEL=debug
NODE_ENV=local
```

3. **Never commit** `.env.local` (it's in `.gitignore`)

### Step 10.2: Verify Setup

Run:
```bash
npm run dev
```

If no errors in startup, environment variables are correctly loaded.

---

## § 11. VERCEL DEPLOYMENT SETUP

### Step 11.1: Link Vercel Project

```bash
vercel link
```

Follow prompts to connect your GitHub repo to a Vercel project.

### Step 11.2: Add Environment Variables via Vercel Dashboard

1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**
2. Select your project: `detective-telegram`
3. Go to **Settings** → **Environment Variables**
4. Click **"Add New"** for each variable:

**For each variable**:
- **Name**: `TELEGRAM_BOT_TOKEN`
- **Value**: (paste your token)
- **Environments**: Select `Production`, `Preview`, `Development` (or all)
- Click **"Add**

**Variables to add** (in this order):
1. `TELEGRAM_BOT_TOKEN`
2. `TELEGRAM_SECRET`
3. `FIREBASE_PROJECT_ID`
4. `FIREBASE_PRIVATE_KEY` (⚠️ multiline value — paste carefully)
5. `FIREBASE_CLIENT_EMAIL`
6. `ADMIN_SECRET_TOKEN`
7. `AI_PROVIDER`
8. `LOG_LEVEL`
9. `NODE_ENV`

### Step 11.3: Deploy to Vercel

```bash
vercel deploy --prod
```

This deploys with environment variables loaded.

### Step 11.4: Verify Deployment

```bash
curl https://your-project.vercel.app/api/health
```

Should return:
```json
{ "status": "ok" }
```

---

## § 12. TROUBLESHOOTING

### Issue: "TELEGRAM_BOT_TOKEN is undefined"

**Cause**: Environment variable not loaded

**Solution**:
- Local: Restart dev server after editing `.env.local`
- Vercel: Re-deploy after adding environment variable
- Check: `echo $TELEGRAM_BOT_TOKEN` (should print value)

### Issue: "Firebase authentication failed"

**Cause**: Invalid Firebase credentials

**Solution**:
1. Double-check `FIREBASE_PROJECT_ID` matches your Firebase project
2. Verify `FIREBASE_PRIVATE_KEY` is complete (starts with `-----BEGIN PRIVATE KEY-----`)
3. Verify `FIREBASE_CLIENT_EMAIL` matches service account JSON
4. Regenerate service account if uncertain: Firebase Console > Project Settings > Service Accounts > Generate new key

### Issue: "Webhook secret validation failed"

**Cause**: `TELEGRAM_SECRET` doesn't match secret configured in Telegram

**Solution**:
1. Update Telegram webhook:
```bash
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET"
```
2. Restart app to reload environment variables

### Issue: "Admin token rejected"

**Cause**: Incorrect `ADMIN_SECRET_TOKEN`

**Solution**:
- Ensure token matches exactly (case-sensitive)
- Regenerate and update if unsure

---

## § 13. SECURITY CHECKLIST

Before deploying to production:

- ✅ Never commit `.env*` files to git (check `.gitignore`)
- ✅ All secrets are 32+ characters
- ✅ `FIREBASE_PRIVATE_KEY` is complete (not truncated)
- ✅ Telegram webhook uses `https://` (not `http://`)
- ✅ `ENABLE_ERROR_STACK_TRACES=false` in production
- ✅ Firestore rules updated (not test mode) — for production only
- ✅ Regularly rotate secrets if compromise suspected
- ✅ Don't share environment variable values via chat/email

---

## § 14. QUICK REFERENCE COMMAND

### Generate All Secrets at Once (Linux/Mac)

```bash
echo "TELEGRAM_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_SECRET_TOKEN=$(openssl rand -hex 32)"
```

Copy output and paste into `.env.local` or Vercel dashboard.

---

## § 15. SUPPORT & DOCUMENTATION

For more details:
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Firebase Docs**: https://firebase.google.com/docs/firestore
- **Vercel Environment Variables**: https://vercel.com/docs/environment-variables
- **Detective Telegram Docs**: See `docs/` folder

---

**Last Updated**: 2026-09-01  
**Status**: Complete ✅
