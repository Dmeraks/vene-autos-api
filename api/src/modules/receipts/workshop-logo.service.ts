/**
 * Carga y cachea los logos del taller (factura Carta + ticket térmico) desde el disco.
 *
 * Los logos se esperan en la raíz del repo/monorepo (`G:\Vene Autos\logo_factura.png` y
 * `logo_ticket.png` según la instalación). La ruta se puede sobrescribir por entorno
 * (`WORKSHOP_LOGOS_DIR`) para facilitar el arranque en otras máquinas. Si falta el
 * archivo, el servicio devuelve `null` y el consumidor sigue adelante sin logo.
 *
 * Motivos para que esto viva en el API y no en el puente:
 *   1. El HTML/PDF formal (factura no fiscal Carta) se renderiza en el API y necesita el
 *      logo_factura embebido (data URL).
 *   2. El ticket térmico usa logo_ticket, pero la copia se hace una vez al instalar el
 *      puente; el API queda como fuente única y permite reimpresión sin depender de la PC.
 */
import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

export type LogoKind = 'invoice' | 'ticket' | 'watermark';

type CacheEntry = {
  buffer: Buffer;
  mime: string;
  mtimeMs: number;
  path: string;
};

@Injectable()
export class WorkshopLogoService {
  private readonly logger = new Logger(WorkshopLogoService.name);
  private readonly cache = new Map<LogoKind, CacheEntry>();

  /** Directorio donde buscar los archivos. Permite override via `WORKSHOP_LOGOS_DIR`. */
  private logosDir(): string {
    const envDir = process.env.WORKSHOP_LOGOS_DIR?.trim();
    if (envDir) return envDir;
    // El api se ejecuta desde `api/`. Subimos un nivel al root del monorepo.
    return path.resolve(process.cwd(), '..');
  }

  private async candidatePaths(kind: LogoKind): Promise<string[]> {
    const dir = this.logosDir();
    const baseName =
      kind === 'invoice'
        ? 'logo_factura'
        : kind === 'watermark'
          ? 'marca_de_agua'
          : 'logo_ticket';
    return [
      path.join(dir, `${baseName}.png`),
      path.join(dir, `${baseName}.jpg`),
      path.join(dir, `${baseName}.jpeg`),
      path.join(dir, `${baseName}.webp`),
    ];
  }

  private extToMime(ext: string): string {
    const e = ext.toLowerCase();
    if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
    if (e === '.webp') return 'image/webp';
    return 'image/png';
  }

  /** Devuelve la entrada cacheada (o la lee) o `null` si no hay archivo. */
  async getLogo(kind: LogoKind): Promise<CacheEntry | null> {
    const candidates = await this.candidatePaths(kind);
    for (const p of candidates) {
      try {
        const st = await fs.stat(p);
        const cached = this.cache.get(kind);
        if (cached && cached.path === p && cached.mtimeMs === st.mtimeMs) {
          return cached;
        }
        const buffer = await fs.readFile(p);
        const entry: CacheEntry = {
          buffer,
          mime: this.extToMime(path.extname(p)),
          mtimeMs: st.mtimeMs,
          path: p,
        };
        this.cache.set(kind, entry);
        return entry;
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          continue;
        }
        this.logger.warn(
          `No se pudo leer logo ${kind} en ${p}: ${(err as Error)?.message ?? err}`,
        );
      }
    }
    return null;
  }

  /** Devuelve un data URL (`data:image/png;base64,…`) o `null` si no hay logo. */
  async getDataUrl(kind: LogoKind): Promise<string | null> {
    const entry = await this.getLogo(kind);
    if (!entry) return null;
    return `data:${entry.mime};base64,${entry.buffer.toString('base64')}`;
  }
}
