import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/config/env";
import { runMigrations } from "@/lib/db/migrate";

type DbState = {
  client: Client;
  db: LibSQLDatabase<typeof schema>;
  migrationPromise: Promise<void>;
};

function ensureSqliteDirectory(databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) {
    return;
  }

  const filePath = databaseUrl.replace(/^file:/, "");
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const dir = path.dirname(absolute);
  mkdirSync(dir, { recursive: true });
}

function createDbState(): DbState {
  const env = getEnv();
  ensureSqliteDirectory(env.DATABASE_URL);

  const client = createClient({
    url: env.DATABASE_URL,
  });

  const db = drizzle(client, { schema });
  const migrationPromise = runMigrations(client);

  return { client, db, migrationPromise };
}

const globalState = globalThis as typeof globalThis & { __mintaborateDb?: DbState };

if (!globalState.__mintaborateDb) {
  globalState.__mintaborateDb = createDbState();
}

export async function getDb(): Promise<LibSQLDatabase<typeof schema>> {
  const state = globalState.__mintaborateDb!;
  await state.migrationPromise;
  return state.db;
}

export async function getClient(): Promise<Client> {
  const state = globalState.__mintaborateDb!;
  await state.migrationPromise;
  return state.client;
}
