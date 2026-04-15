import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

// --- File-based store (local dev + Vercel fallback) ---

class FileKVStore implements KVStore {
  private dir: string;

  constructor() {
    // On Vercel, use /tmp (only writable directory)
    // Locally, use data/ in project root
    const base = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
    this.dir = base;
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    } catch {
      // Ignore mkdir errors
    }
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
    } catch {
      // Ignore write errors on read-only filesystem
    }
  }
}

// --- Upstash Redis store (production on Vercel) ---

class UpstashKVStore implements KVStore {
  private url: string;
  private token: string;

  constructor() {
    this.url = process.env.KV_REST_API_URL!;
    this.token = process.env.KV_REST_API_TOKEN!;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.url}/get/${key}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.result === null || data.result === undefined) return null;
      // Upstash returns strings, parse JSON
      return typeof data.result === "string"
        ? JSON.parse(data.result)
        : data.result;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await fetch(`${this.url}/set/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(value)),
      });
    } catch {
      // Ignore errors
    }
  }
}

// --- Factory ---

let store: KVStore | null = null;

export function getStore(): KVStore {
  if (!store) {
    store = process.env.KV_REST_API_URL
      ? new UpstashKVStore()
      : new FileKVStore();
  }
  return store;
}
