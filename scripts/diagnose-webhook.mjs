const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set in environment");
  process.exit(1);
}
const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const d = await r.json();
console.log(JSON.stringify(d, null, 2));
