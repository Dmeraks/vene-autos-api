import { SetMetadata, applyDecorators } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Códigos `recurso:acción` requeridos (AND). */
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

export const PERMISSIONS_ANY_KEY = 'permissions_any';

/** Al menos uno de los códigos debe estar concedido (OR). */
export const RequireAnyPermission = (...codes: string[]) =>
  applyDecorators(SetMetadata(PERMISSIONS_ANY_KEY, codes));
