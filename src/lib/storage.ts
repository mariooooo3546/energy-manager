import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

// --- File-based store (local development) ---

class FileKVStore implements KVStore {
  private dir: string;

  constructor() {
    this.dir = join(process.cwd(), "data");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  async get<T>(key: string): Promise<T | null> {
    const path = join(this.dir, `${key}.json`);
    try {
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const path = join(this.dir, `${key}.json`);
    writeFileSync(path, JSON.stringify(value, null, 2));
  }
}

// --- Vercel KV store (production) ---

class VercelKVStore implements KVStore {
  private kv: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<unknown> } | null = null;

  private async getKV() {
    if (!this.kv) {
      const mod = await import("@vercel/kv");
      this.kv = mod.kv;
    }
    return this.kv!;
  }

  async get<T>(key: string): Promise<T | null> {
    const kv = await this.getKV();
    const val = await kv.get(key);
    return (val as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const kv = await this.getKV();
    await kv.set(key, value);
  }
}

// --- Factory ---

let store: KVStore | null = null;

export function getStore(): KVStore {
  if (!store) {
    store = process.env.KV_REST_API_URL
      ? new VercelKVStore()
      : new FileKVStore();
  }
  return store;
}
