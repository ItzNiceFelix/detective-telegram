import type { VercelRequest, VercelResponse } from "@vercel/node";

async function handlerInternal(): Promise<{ status: number; body: string }> {
  return {
    status: 200,
    body: "cron entrypoint",
  };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const hasil = await handlerInternal();
  res.status(hasil.status).send(hasil.body);
}
