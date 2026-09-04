const key = process.env.GEMINI_API_KEY;
const model = process.env.AI_TEXT_MODEL ?? "gemini-flash-latest";

console.log("model:", model);
console.log("key prefix:", key ? key.slice(0, 6) : "(empty)");

const r = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: pong" }] }],
      generationConfig: { maxOutputTokens: 10 },
    }),
  },
);
const text = await r.text();
console.log("HTTP", r.status);
console.log(text.slice(0, 2000));