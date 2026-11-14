import { isAbsolute, join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// same resolution as src/env.ts: relative paths are from the repo root (drizzle-kit runs with cwd = apps/api)
const dbPath = process.env.DATABASE_PATH?.trim() || './data/hestia.db';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: isAbsolute(dbPath) ? dbPath : join(process.cwd(), '../..', dbPath) },
});
