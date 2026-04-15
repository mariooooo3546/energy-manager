import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

// --- File-based store (local dev) ---

class FileKVStore implements KVStore {
  private dir: string;

  constructor() {
    const base = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
    this.dir = base;
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    } catch {}
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
    try {
      const path = join(this.dir, `${key}.json`);
      writeFileSync(path, JSON.stringify(value, null, 2));
    } catch {}
  }
}

// --- Redis store (Upstash via Vercel) ---

class RedisKVStore implements KVStore {
  private clientPromise: Promise<import("redis").RedisClientType> | null = null;

  private getClient() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { createClient } = await import("redis");
        const client = createClient({ url: process.env.REDIS_URL! });
        await client.connect();
        return client as import("redis").RedisClientType;
      })();
    }
    return this.clientPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const val = await client.get(key);
      if (val === null) return null;
      return JSON.parse(val) as T;
    } catch (err) {
      console.error("[Redis] get error:", err);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const client = await this.getClient();
      await client.set(key, JSON.stringify(value));
    } catch (err) {
      console.error("[Redis] set error:", err);
    }
  }
}

// --- Factory ---

let store: KVStore | null = null;

export function getStore(): KVStore {
  if (!store) {
    store = process.env.REDIS_URL
      ? new RedisKVStore()
      : new FileKVStore();
  }
  return store;
}
