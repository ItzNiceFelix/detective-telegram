export async function handler(): Promise<{ status: number; body: string }> {
  return {
    status: 200,
    body: "admin entrypoint",
  };
}
