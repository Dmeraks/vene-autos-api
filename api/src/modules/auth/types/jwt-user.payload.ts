export interface JwtUserPayload {
  sub: string;
  /** Id de fila `UserAuthSession`; una sesión activa por usuario al iniciar sesión. */
  sid: string;
  email: string;
  fullName: string;
  /** Códigos `recurso:acción` efectivos (unión de roles). */
  permissions: string[];
  /** Cliente del taller enlazado (rol portal). */
  portalCustomerId?: string | null;
  /** Solo administración/dueño probando la app con permisos de otro rol (claim JWT `prv`). */
  previewRole?: { id: string; slug: string; name: string };
}
