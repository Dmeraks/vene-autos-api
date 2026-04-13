export interface JwtUserPayload {
  sub: string;
  /** Id de fila `UserAuthSession`; una sesión activa por usuario al iniciar sesión. */
  sid: string;
  email: string;
  fullName: string;
  /** Códigos `recurso:acción` efectivos (unión de roles). */
  permissions: string[];
}
