import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const buildUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const buildAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let runtimeUrl: string | undefined;
let runtimeAnonKey: string | undefined;
let client: SupabaseClient | null = null;

function resolveUrl(): string | undefined {
  return buildUrl || runtimeUrl;
}

function resolveAnonKey(): string | undefined {
  return buildAnonKey || runtimeAnonKey;
}

export function applySupabaseRuntimeConfig(url: string, anonKey: string): void {
  runtimeUrl = url;
  runtimeAnonKey = anonKey;
  client = null;
}

export function isSupabaseConfigured(): boolean {
  const url = resolveUrl();
  const anonKey = resolveAnonKey();
  return Boolean(url && anonKey && url.includes("supabase.co"));
}

export function getSupabaseConfigHint(): string | null {
  const url = resolveUrl();
  const anonKey = resolveAnonKey();
  if (!url && !buildUrl) return "VITE_SUPABASE_URL missing (add .env.local or public/cloud-config.json)";
  if (!anonKey && !buildAnonKey) return "VITE_SUPABASE_ANON_KEY missing (add .env.local or public/cloud-config.json)";
  if (!url?.includes("supabase.co")) return "VITE_SUPABASE_URL invalid";
  return null;
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = resolveUrl()!;
  const anonKey = resolveAnonKey()!;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
