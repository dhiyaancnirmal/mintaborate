import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { getEnv } from "@/lib/config/env";
import { runMigrations } from "@/lib/db/migrate";

async function main(): Promise<void> {
  const env = getEnv();

  if (env.DATABASE_URL.startsWith("file:")) {
    const filePath = env.DATABASE_URL.replace(/^file:/, "");
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    mkdirSync(path.dirname(absolutePath), { recursive: true });
  }

  const client = createClient({ url: env.DATABASE_URL });
  await runMigrations(client);
  console.log("Migrations applied successfully.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
