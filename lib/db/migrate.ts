import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@libsql/client";

export async function runMigrations(
  client: Client,
  migrationsDir = path.resolve(process.cwd(), "lib/db/migrations"),
): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS __migrations (file_name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );

  const appliedRows = await client.execute("SELECT file_name FROM __migrations");
  const appliedSet = new Set(appliedRows.rows.map((row) => String(row.file_name)));

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, "utf8");

    const statements = sql
      .split(/;\s*\n/g)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await client.execute(statement);
    }

    await client.execute({
      sql: "INSERT INTO __migrations (file_name, applied_at) VALUES (?, ?)",
      args: [file, Date.now()],
    });
  }
}
