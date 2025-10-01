import { createClient } from '@vercel/kv';

let client: ReturnType<typeof createClient> | null = null;

export function getKvClient(): ReturnType<typeof createClient> {
  if (client) return client;

  const url =
    process.env.KV_KV_REST_API_URL ||
    process.env.KV_KV_URL ||
    process.env.KV_REDIS_URL;

  const token =
    process.env.KV_KV_REST_API_TOKEN || process.env.KV_KV_REST_API_READ_ONLY_TOKEN;

  if (!url || !token) {
    throw new Error('KV connection variables missing. Ensure KV_KV_REST_API_URL and KV_KV_REST_API_TOKEN are set.');
  }

  client = createClient({ url, token });
  return client;
}
