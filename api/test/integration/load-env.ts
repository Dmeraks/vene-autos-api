import { config } from 'dotenv';
import { resolve } from 'path';

/** Carga `api/.env` para que `DATABASE_URL` exista al correr integración en local. */
config({ path: resolve(__dirname, '../../.env'), quiet: true });
