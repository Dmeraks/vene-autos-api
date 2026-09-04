/**
 * Script de backup de base de datos usando pg_dump.
 *
 * Uso:
 *   ts-node --project tsconfig.scripts.json prisma/scripts/db-backup.ts [local|production]
 *
 * - local: Usa DATABASE_URL del .env (Docker local)
 * - production: Usa DIRECT_URL del .env (Supabase)
 *
 * El backup se guarda en api/backups/ con formato: vene_autos_<tipo>_<timestamp>.sql.gz
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const PG_DUMP_PATH = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe';
const BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.slice(1),
    user: parsed.username,
    password: parsed.password,
  };
}

function createBackup(type: 'local' | 'production'): string {
  loadEnv();

  const urlEnvKey = type === 'production' ? 'DIRECT_URL' : 'DATABASE_URL';
  const url = process.env[urlEnvKey];

  if (!url) {
    throw new Error(`Variable ${urlEnvKey} no encontrada en .env`);
  }

  if (!fs.existsSync(PG_DUMP_PATH)) {
    throw new Error(
      `pg_dump no encontrado en ${PG_DUMP_PATH}. Verifica que PostgreSQL esté instalado.`,
    );
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const db = parseDatabaseUrl(url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `vene_autos_${type}_${timestamp}.sql.gz`;
  const outputPath = path.join(BACKUP_DIR, filename);

  console.log(`\n📦 Iniciando backup ${type}...`);
  console.log(`   Base de datos: ${db.database}`);
  console.log(`   Host: ${db.host}:${db.port}`);
  console.log(`   Archivo: ${filename}\n`);

  const env = {
    ...process.env,
    PGPASSWORD: db.password,
  };

  const cmd = [
    `"${PG_DUMP_PATH}"`,
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--username=${db.user}`,
    `--dbname=${db.database}`,
    '--format=custom', // Formato custom de pg_dump (requiere pg_restore)
    '--compress=9',    // Máxima compresión
    '--no-owner',
    '--no-privileges',
    '--verbose',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, {
      env,
      stdio: 'inherit',
      timeout: 300_000, // 5 minutos
    });

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n✅ Backup completado exitosamente.`);
    console.log(`   Archivo: ${outputPath}`);
    console.log(`   Tamaño: ${sizeMB} MB\n`);

    return outputPath;
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    throw new Error(`Error al ejecutar pg_dump: ${error}`);
  }
}

// Ejecutar si se llama directamente
const args = process.argv.slice(2);
const type = (args[0] as 'local' | 'production') || 'local';

if (!['local', 'production'].includes(type)) {
  console.error('Uso: ts-node db-backup.ts [local|production]');
  process.exit(1);
}

try {
  createBackup(type);
} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
