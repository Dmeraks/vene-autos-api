import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DianProvider } from './dian-provider.interface';
import { NoopDianProvider } from './noop-dian.provider';

/**
 * Resuelve el proveedor DIAN en tiempo de ejecución a partir de `WorkshopSetting`.
 *
 * Estrategia:
 *  - Lee `dian.enabled`, `dian.provider`, `dian.environment`, credenciales.
 *  - Si algún requisito falta o `dian.enabled` es false → devuelve `NoopDianProvider`.
 *  - (Futuro) Cuando se integre un proveedor real, se agrega aquí un branch que lo construya.
 *
 * Resolver por request (no en el constructor del módulo) nos permite cambiar de
 * proveedor desde Configuración **sin reiniciar** el servidor.
 */
@Injectable()
export class DianProviderFactory {
  private readonly logger = new Logger(DianProviderFactory.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(): Promise<DianProvider> {
    const rows = await this.prisma.workshopSetting.findMany({
      where: {
        key: {
          in: [
            'dian.enabled',
            'dian.provider',
            'dian.environment',
            'dian.api_base_url',
            'dian.api_token',
            'dian.company_nit',
          ],
        },
      },
    });

    const map = new Map(rows.map((r) => [r.key, r.value] as const));
    const enabled = map.get('dian.enabled') === true || map.get('dian.enabled') === 'true';
    if (!enabled) {
      return new NoopDianProvider();
    }

    const provider = normalizeString(map.get('dian.provider'));
    const environment = normalizeString(map.get('dian.environment')) ?? 'sandbox';
    const apiBase = normalizeString(map.get('dian.api_base_url'));
    const apiToken = normalizeString(map.get('dian.api_token'));
    const companyNit = normalizeString(map.get('dian.company_nit'));

    if (!provider || !apiBase || !apiToken || !companyNit) {
      this.logger.debug(
        'DIAN habilitado pero faltan credenciales (provider/api_base/api_token/company_nit). Usando NoopDianProvider.',
      );
      return new NoopDianProvider();
    }

    // Hoy no hay integración concreta. Dejamos el hook listo para futuras ramas:
    //   if (provider === 'facture') return new FactureDianProvider({ environment, ... });
    //   if (provider === 'alegra')  return new AlegraDianProvider({ environment, ... });
    void environment;
    return new NoopDianProvider();
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}
