export async function handler(_request: unknown): Promise<{ status: number; body: string }> {
  return {
    status: 200,
    body: "telegram entrypoint",
  };
}
