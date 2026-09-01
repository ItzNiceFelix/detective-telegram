# Environment Variables Quick Setup Card

**Purpose**: Quick reference for obtaining all environment variable values  
**For Complete Guide**: See `docs/ENV-SETUP.md`

---

## Quick Setup (5-10 minutes)

### 1️⃣ TELEGRAM BOT TOKEN
```
Go to: https://t.me/botfather
Send: /newbot
Follow prompts, receive: 123456:ABCDefgh...
Store as: TELEGRAM_BOT_TOKEN=
```

### 2️⃣ TELEGRAM WEBHOOK SECRET
```
Generate: openssl rand -hex 32
Example: a3f9c8e2b1d7e4f6a9c2b5e8f1d4a7...
Store as: TELEGRAM_SECRET=
```

### 3️⃣ FIREBASE PROJECT ID
```
Go to: https://console.firebase.google.com/
Create project or select existing
Copy: Project Settings > General > Project ID
Store as: FIREBASE_PROJECT_ID=
```

### 4️⃣ FIREBASE SERVICE ACCOUNT
```
Go to: Firebase Console > Project Settings > Service Accounts
Click: "Generate new private key"
File downloaded: detective-telegram-...firebase-adminsdk-....json
Extract from JSON file:
  - FIREBASE_PRIVATE_KEY= (full "private_key" value)
  - FIREBASE_CLIENT_EMAIL= (full "client_email" value)
```

### 5️⃣ ADMIN SECRET TOKEN
```
Generate: openssl rand -hex 32
Example: 7e3a1c5f9b2d8a4e6f1c3b5a8d2e7f...
Store as: ADMIN_SECRET_TOKEN=
```

### 6️⃣ AI PROVIDER (Optional)
```
For closed beta, use:
  AI_PROVIDER=fake
  AI_MODEL=

For production, choose:
  - OpenAI: Get key from https://platform.openai.com/api-keys
  - Anthropic: Get key from https://console.anthropic.com/
  - Gemini: Get key from https://makersuite.google.com/app/apikey
```

---

## Checklist

```
☐ TELEGRAM_BOT_TOKEN obtained from @BotFather
☐ TELEGRAM_SECRET generated (32+ chars)
☐ Firebase project created
☐ Firestore database initialized
☐ Service account created & JSON downloaded
☐ FIREBASE_PROJECT_ID copied
☐ FIREBASE_PRIVATE_KEY copied (multiline)
☐ FIREBASE_CLIENT_EMAIL copied
☐ ADMIN_SECRET_TOKEN generated (32+ chars)
☐ .env.local created with all values
☐ npm run dev works without errors
```

---

## Files & Commands

```bash
# Local development
cp .env.example .env.local      # Create local env file
nano .env.local                 # Edit with values
npm run dev                     # Start server

# Vercel deployment
vercel link                     # Link to Vercel
vercel env add VAR_NAME         # Add each env var
vercel env ls                   # Verify all vars added
vercel deploy --prod            # Deploy

# Verify setup
npm run test                    # Run tests
npm run typecheck               # Check TypeScript
npm run build                   # Build for production
```

---

## Telegram Webhook Setup (After Deployment)

```bash
# Set webhook with secret
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook \
  -d url="https://your-vercel-project.vercel.app/api/telegram" \
  -d secret_token="$TELEGRAM_SECRET"

# Verify
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo

# Delete webhook (if needed)
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook
```

---

## Common Mistakes ❌

❌ **Forgetting to generate TELEGRAM_SECRET**  
✅ Generate: `openssl rand -hex 32`

❌ **Truncating FIREBASE_PRIVATE_KEY**  
✅ Copy entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

❌ **Using wrong FIREBASE_PROJECT_ID**  
✅ Verify matches Firebase Console > Project Settings

❌ **Committing .env.local to git**  
✅ Check .gitignore includes `.env*` files

❌ **Not converting FIREBASE_PRIVATE_KEY newlines**  
✅ In Vercel, paste as-is (Vercel handles newlines automatically)

❌ **Setting TELEGRAM_SECRET different in code vs webhook setup**  
✅ Use exact same value for both

---

## Support

For complete step-by-step guide with screenshots:  
**→ Read: `docs/ENV-SETUP.md`**

For configuration reference:  
**→ Read: `docs/BETA-READINESS.md` § 11**

---

**Last Updated**: 2026-09-01
