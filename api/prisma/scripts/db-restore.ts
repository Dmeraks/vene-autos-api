/**
 * Script de restore de base de datos usando pg_restore.
 *
 * Uso:
 *   ts-node --project tsconfig.scripts.json prisma/scripts/db-restore.ts <archivo> [local|production]
 *
 * - archivo: Ruta al archivo .sql.gz o .sql (formato pg_dump custom o plain text)
 * - local: Usa DATABASE_URL del .env (default)
 * - production: Usa DIRECT_URL del .env (Supabase)
 *
 * ADVERTENCIA: Este script BORRA todos los datos existentes antes de restaurar.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

const PG_RESTORE_PATH = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe';
const PSQL_PATH = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';

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

function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${message} (escribe "SI" para confirmar): `, (answer) => {
      rl.close();
      resolve(answer.toUpperCase() === 'SI');
    });
  });
}

async function restoreDatabase(archivo: string, type: 'local' | 'production'): Promise<void> {
  loadEnv();

  if (!fs.existsSync(archivo)) {
    throw new Error(`Archivo no encontrado: ${archivo}`);
  }

  const urlEnvKey = type === 'production' ? 'DIRECT_URL' : 'DATABASE_URL';
  const url = process.env[urlEnvKey];

  if (!url) {
    throw new Error(`Variable ${urlEnvKey} no encontrada en .env`);
  }

  const db = parseDatabaseUrl(url);

  console.log('\n⚠️  ADVERTENCIA: Este proceso BORRA TODOS LOS DATOS existentes.');
  console.log(`   Base de datos destino: ${db.database}`);
  console.log(`   Host: ${db.host}:${db.port}`);
  console.log(`   Archivo: ${path.basename(archivo)}\n`);

  const confirmado = await askConfirmation(
    '¿Estás seguro de que quieres restaurar? Esta acción es IRREVERSIBLE.',
  );

  if (!confirmado) {
    console.log('\n❌ Operación cancelada por el usuario.\n');
    process.exit(0);
  }

  const env = {
    ...process.env,
    PGPASSWORD: db.password,
  };

  // Paso 1: Desconectar todas las conexiones activas
  console.log('\n🔌 Desconectando conexiones activas...');
  const dropConnections = [
    `"${PSQL_PATH}"`,
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--username=${db.user}`,
    `--dbname=postgres`,
    `-c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db.database}' AND pid <> pg_backend_pid();"`,
  ].join(' ');

  try {
    execSync(dropConnections, { env, stdio: 'pipe' });
  } catch {
    // Ignorar errores de desconexión
  }

  // Paso 2: Eliminar y recrear la base de datos
  console.log('🗑️  Eliminando base de datos existente...');
  const dropDb = [
    `"${PSQL_PATH}"`,
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--username=${db.user}`,
    `--dbname=postgres`,
    `-c "DROP DATABASE IF EXISTS ${db.database};"`,
  ].join(' ');

  execSync(dropDb, { env, stdio: 'pipe' });

  console.log('🆕 Creando nueva base de datos...');
  const createDb = [
    `"${PSQL_PATH}"`,
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--username=${db.user}`,
    `--dbname=postgres`,
    `-c "CREATE DATABASE ${db.database} OWNER ${db.user};"`,
  ].join(' ');

  execSync(createDb, { env, stdio: 'pipe' });

  // Paso 3: Restaurar desde el archivo
  console.log('\n📥 Restaurando datos...\n');

  const isCustomFormat = archivo.endsWith('.sql.gz') || archivo.endsWith('.dump');

  let cmd: string;
  if (isCustomFormat) {
    cmd = [
      `"${PG_RESTORE_PATH}"`,
      `--host=${db.host}`,
      `--port=${db.port}`,
      `--username=${db.user}`,
      `--dbname=${db.database}`,
      '--no-owner',
      '--no-privileges',
      '--verbose',
      '--if-exists',
      '--clean',
      `"${archivo}"`,
    ].join(' ');
  } else {
    // Plain SQL
    cmd = [
      `"${PSQL_PATH}"`,
      `--host=${db.host}`,
      `--port=${db.port}`,
      `--username=${db.user}`,
      `--dbname=${db.database}`,
      `-f "${archivo}"`,
    ].join(' ');
  }

  try {
    execSync(cmd, {
      env,
      stdio: 'inherit',
      timeout: 600_000, // 10 minutos
    });

    console.log('\n✅ Restore completado exitosamente.\n');
  } catch (error) {
    throw new Error(`Error al restaurar: ${error}`);
  }
}

// Ejecutar si se llama directamente
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Uso: ts-node db-restore.ts <archivo> [local|production]');
  process.exit(1);
}

const archivo = path.resolve(args[1] || args[0]);
const type = (args[1] || 'local') as 'local' | 'production';

if (!['local', 'production'].includes(type)) {
  console.error('Tipo debe ser "local" o "production"');
  process.exit(1);
}

restoreDatabase(archivo, type).catch((error) => {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
