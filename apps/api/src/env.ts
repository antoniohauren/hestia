import { isAbsolute, join } from 'node:path';

const repoRoot = join(import.meta.dir, '../../..');

function required(name: string) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Variável de ambiente ${name} não definida. Veja .env.example.`);
    process.exit(1);
  }
  return v;
}

const dbPath = process.env.DATABASE_PATH?.trim() || './data/hestia.db';

export const env = {
  pin: required('HESTIA_PIN'),
  secret: required('HESTIA_SECRET'),
  databasePath: isAbsolute(dbPath) ? dbPath : join(repoRoot, dbPath),
  port: Number(process.env.PORT) || 3000,
  timeZone: process.env.TZ?.trim() || 'America/Sao_Paulo',
  production: process.env.NODE_ENV === 'production',
};
