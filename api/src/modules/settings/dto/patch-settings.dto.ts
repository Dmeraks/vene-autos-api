import { IsObject } from 'class-validator';

export class PatchSettingsDto {
  /** Mapa clave → valor JSON (se fusiona por clave). */
  @IsObject()
  values!: Record<string, unknown>;
}
