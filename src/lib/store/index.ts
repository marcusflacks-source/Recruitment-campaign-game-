import { config } from "../config";
import type { Store } from "./types";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";

// Resolve the active store once per instance. Supabase when configured,
// otherwise the in-memory fallback so the hub always boots.
let singleton: Store | null = null;

export function getStore(): Store {
  if (singleton) return singleton;
  if (config.supabase.enabled) {
    singleton = new SupabaseStore();
    console.info("[store] using Supabase");
  } else {
    singleton = new MemoryStore();
    console.info("[store] using in-memory store (no Supabase env set — dev only)");
  }
  return singleton;
}

export * from "./types";
