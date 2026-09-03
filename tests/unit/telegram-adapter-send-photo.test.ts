import test from "node:test";
import assert from "node:assert/strict";

import { TelegramAdapter } from "../../src/infrastructure/adapters/telegram/telegram.js";
import { KesalahanIntegrasi } from "../../src/fondasi/eror.js";

const TOKEN = "TEST-TOKEN-LIVE";

function buatAdapter(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
): TelegramAdapter {
  const impl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input.toString();
    return handler(urlStr, init);
  }) as typeof fetch;
  return new TelegramAdapter({ botToken: TOKEN, fetchImpl: impl, apiBase: "https://api.ujian.test", timeoutMs: 500 });
}

function responsJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function fotoSukses(fileId = "F-HIGH", width = 1024, height = 768, file_size = 90000): Record<string, unknown> {
  return {
    ok: true,
    result: {
      message_id: 1,
      chat: { id: -1001, type: "channel" },
      date: 1,
      photo: [
        { file_id: "F-LOW", width: 320, height: 180, file_size: 30000 },
        { file_id: fileId, width, height, file_size },
      ],
    },
  };
}

function errorTimeout(): Error {
  const e = new Error("operation aborted by timeout");
  e.name = "TimeoutError";
  return e;
}

test("sendPhoto multipart: POST /sendPhoto dgn FormData; foto Blob; bukan JSON; token tak di body", async () => {
  let urlTangkap = "";
  let bodyTangkap: unknown;
  let headerTangkap: unknown;
  const ad = buatAdapter(async (url, init) => {
    urlTangkap = url;
    bodyTangkap = init?.body;
    headerTangkap = init?.headers;
    return responsJson(fotoSukses());
  });

  const hasil = await ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });

  assert.ok(urlTangkap.endsWith("/sendPhoto"));
  assert.ok(bodyTangkap instanceof FormData, "body harus FormData multipart");
  assert.equal(bodyTangkap.get("chat_id"), "-1001");
  const photo = bodyTangkap.get("photo");
  assert.ok(photo instanceof Blob, "photo harus Blob");
  assert.equal(photo.type, "image/png");
  assert.equal(new Uint8Array(await photo.arrayBuffer()).length, 3);
  const ct = String((headerTangkap as Record<string, string> | null)?.["content-type"] ?? "");
  assert.ok(!/^application\/json$/i.test(ct), "tidak boleh content-type JSON manual");
  assert.ok(!String(bodyTangkap).includes(TOKEN), "token tidak boleh di body");
  assert.ok(hasil.fileId.length > 0);
});

test("regresi: kirimPesanTelegram tetap JSON", async () => {
  let bodyTangkap: unknown;
  const ad = buatAdapter(async (_url, init) => {
    bodyTangkap = init?.body;
    return responsJson({ ok: true, result: { message_id: 2 } });
  });
  await ad.kirimPesanTelegram("-1001", "halo");
  assert.equal(typeof bodyTangkap, "string");
  assert.deepEqual(JSON.parse(bodyTangkap as string), { chat_id: "-1001", text: "halo" });
});

test("file_id extraction: resolusi tertinggi + width/height/sizeBytes", async () => {
  const ad = buatAdapter(async () => responsJson(fotoSukses("F-HIGH", 1024, 768, 90000)));
  const r = await ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" });
  assert.equal(r.fileId, "F-HIGH");
  assert.equal(r.width, 1024);
  assert.equal(r.height, 768);
  assert.equal(r.sizeBytes, 90000);
});

test("file_id extraction: foto tunggal tanpa dimensi → fileId ada, metadata opsional kosong", async () => {
  const ad = buatAdapter(async () =>
    responsJson({ ok: true, result: { message_id: 1, photo: [{ file_id: "F-ONLY" }] } }),
  );
  const r = await ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" });
  assert.equal(r.fileId, "F-ONLY");
  assert.equal(r.width, undefined);
  assert.equal(r.height, undefined);
});

test("error Telegram ok=false → KesalahanIntegrasi berisi deskripsi; token tak bocor", async () => {
  const ad = buatAdapter(async () =>
    responsJson({ ok: false, error_code: 400, description: "Bad Request: file_id is invalid" }),
  );
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("file_id is invalid"));
      assert.ok(!String(err.message).includes(TOKEN));
      return true;
    },
  );
});

test("timeout → KesalahanIntegrasi timeout", async () => {
  const ad = buatAdapter(async () => {
    throw errorTimeout();
  });
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("timeout"));
      return true;
    },
  );
});

test("invalid response: tanpa photo/file_id → KesalahanIntegrasi", async () => {
  const ad = buatAdapter(async () => responsJson({ ok: true, result: { message_id: 1, photo: [] } }));
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("photo.file_id"));
      return true;
    },
  );
});

test("invalid response: bukan JSON → KesalahanIntegrasi", async () => {
  const ad = buatAdapter(async () => new Response("not-json", { status: 200 }));
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("tidak valid"));
      return true;
    },
  );
});

test("invalid response: HTTP error → KesalahanIntegrasi HTTP", async () => {
  const ad = buatAdapter(async () => new Response("boom", { status: 500 }));
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("HTTP 500"));
      return true;
    },
  );
});

test("bytes kosong → KesalahanIntegrasi tanpa fetch", async () => {
  let dipanggil = false;
  const ad = buatAdapter(async () => {
    dipanggil = true;
    return responsJson(fotoSukses());
  });
  await assert.rejects(
    () => ad.kirimFotoTelegram("-1001", { bytes: new Uint8Array(0), contentType: "image/png" }),
    (err: unknown) => {
      assert.ok(err instanceof KesalahanIntegrasi);
      assert.ok(String(err.message).includes("kosong"));
      return true;
    },
  );
  assert.equal(dipanggil, false);
});