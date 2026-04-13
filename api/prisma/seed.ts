/**
 * Semilla idempotente: permisos, categorías de caja, roles del taller y usuario administrador.
 * Ejecutar tras migraciones (`npx prisma migrate deploy` / `migrate dev`) para que existan tablas.
 */
import { CashMovementDirection, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Catálogo de permisos (Fase 1 identidad/config + Fase 2 caja y delegados). */
const PERMISSIONS: Array<{ resource: string; action: string; description: string }> = [
  { resource: 'users', action: 'read', description: 'Listar y ver usuarios' },
  { resource: 'users', action: 'create', description: 'Crear usuarios' },
  { resource: 'users', action: 'update', description: 'Actualizar usuarios' },
  { resource: 'users', action: 'deactivate', description: 'Desactivar usuarios' },
  { resource: 'roles', action: 'read', description: 'Ver roles y permisos asignados' },
  { resource: 'roles', action: 'create', description: 'Crear roles' },
  { resource: 'roles', action: 'update', description: 'Actualizar roles y permisos' },
  { resource: 'roles', action: 'delete', description: 'Eliminar roles no sistema' },
  { resource: 'permissions', action: 'read', description: 'Listar permisos del catálogo' },
  { resource: 'audit', action: 'read', description: 'Consultar auditoría' },
  { resource: 'settings', action: 'read', description: 'Ver configuración del taller' },
  { resource: 'settings', action: 'update', description: 'Modificar configuración del taller' },
  { resource: 'cash_sessions', action: 'read', description: 'Ver sesiones y estado de caja' },
  { resource: 'cash_sessions', action: 'open', description: 'Abrir sesión de caja' },
  { resource: 'cash_sessions', action: 'close', description: 'Cerrar sesión de caja (dueño/admin)' },
  { resource: 'cash_movements', action: 'read', description: 'Ver movimientos de caja' },
  { resource: 'cash_movements', action: 'create_income', description: 'Registrar ingresos de caja' },
  {
    resource: 'cash_movements',
    action: 'create_expense',
    description: 'Registrar egresos (elevados o hasta 3 delegados)',
  },
  {
    resource: 'cash_delegates',
    action: 'manage',
    description: 'Gestionar delegados de egreso (máx. 3)',
  },
  {
    resource: 'cash_expense_requests',
    action: 'create',
    description: 'Crear solicitud de egreso pendiente de aprobación',
  },
  {
    resource: 'cash_expense_requests',
    action: 'read',
    description: 'Ver solicitudes de egreso (propias o todas si es elevado)',
  },
  {
    resource: 'cash_expense_requests',
    action: 'approve',
    description: 'Aprobar solicitud de egreso (dueño/admin; crea movimiento en sesión abierta)',
  },
  {
    resource: 'cash_expense_requests',
    action: 'reject',
    description: 'Rechazar solicitud de egreso (dueño/admin)',
  },
  {
    resource: 'cash_expense_requests',
    action: 'cancel',
    description: 'Cancelar solicitud pendiente creada por uno mismo',
  },
  { resource: 'work_orders', action: 'read', description: 'Ver órdenes de trabajo' },
  { resource: 'work_orders', action: 'create', description: 'Crear órdenes de trabajo' },
  { resource: 'work_orders', action: 'update', description: 'Actualizar órdenes de trabajo y estados' },
  {
    resource: 'work_orders',
    action: 'record_payment',
    description: 'Registrar cobro de orden en caja (ingreso vinculado a la OT)',
  },
];

const CASH_CATEGORIES: Array<{
  slug: string;
  name: string;
  direction: CashMovementDirection;
  sortOrder: number;
}> = [
  {
    slug: 'compra_repuestos',
    name: 'Compra de repuestos',
    direction: CashMovementDirection.EXPENSE,
    sortOrder: 10,
  },
  {
    slug: 'pago_proveedor',
    name: 'Pago a proveedores',
    direction: CashMovementDirection.EXPENSE,
    sortOrder: 20,
  },
  {
    slug: 'gasto_menor',
    name: 'Gastos menores',
    direction: CashMovementDirection.EXPENSE,
    sortOrder: 30,
  },
  {
    slug: 'ingreso_cobro',
    name: 'Cobro / ingreso operativo',
    direction: CashMovementDirection.INCOME,
    sortOrder: 40,
  },
  {
    slug: 'ingreso_otro',
    name: 'Otro ingreso',
    direction: CashMovementDirection.INCOME,
    sortOrder: 50,
  },
];

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        resource_action: { resource: p.resource, action: p.action },
      },
      create: p,
      update: { description: p.description },
    });
  }

  for (const c of CASH_CATEGORIES) {
    await prisma.cashMovementCategory.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        direction: c.direction,
        isSystem: true,
        sortOrder: c.sortOrder,
      },
      update: {
        name: c.name,
        direction: c.direction,
        sortOrder: c.sortOrder,
      },
    });
  }

  const allPermissions = await prisma.permission.findMany();

  // --- Roles con alcance amplio: reciben la unión completa de permisos del catálogo ---
  const adminRole = await prisma.role.upsert({
    where: { slug: 'administrador' },
    create: {
      name: 'Administrador',
      slug: 'administrador',
      description: 'Control total del sistema',
      isSystem: true,
    },
    update: { name: 'Administrador', description: 'Control total del sistema' },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((perm) => ({
      roleId: adminRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  const duenoRole = await prisma.role.upsert({
    where: { slug: 'dueno' },
    create: {
      name: 'Dueño',
      slug: 'dueno',
      description: 'Control total (mismo alcance que administrador)',
      isSystem: true,
    },
    update: { name: 'Dueño', description: 'Control total (mismo alcance que administrador)' },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: duenoRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((perm) => ({
      roleId: duenoRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  const pick = (...codes: string[]) =>
    allPermissions.filter((p) => codes.includes(`${p.resource}:${p.action}`));

  // --- Roles operativos de caja: subconjuntos explícitos (sin cierre ni egresos salvo perfil autorizado) ---
  const cajeroCodes = [
    'permissions:read',
    'settings:read',
    'cash_sessions:read',
    'cash_sessions:open',
    'cash_movements:read',
    'cash_movements:create_income',
    'cash_expense_requests:create',
    'cash_expense_requests:read',
    'cash_expense_requests:cancel',
    'work_orders:read',
    'work_orders:create',
    'work_orders:update',
    'work_orders:record_payment',
  ];
  const cajeroPerms = pick(...cajeroCodes);
  const cajeroRole = await prisma.role.upsert({
    where: { slug: 'cajero' },
    create: {
      name: 'Cajero',
      slug: 'cajero',
      description: 'Caja y órdenes de taller: ingresos, apertura, solicitudes de egreso y OT; sin egreso directo ni cierre',
      isSystem: true,
    },
    update: {
      name: 'Cajero',
      description: 'Caja y órdenes de taller: ingresos, apertura, solicitudes de egreso y OT; sin egreso directo ni cierre',
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: cajeroRole.id } });
  if (cajeroPerms.length) {
    await prisma.rolePermission.createMany({
      data: cajeroPerms.map((perm) => ({
        roleId: cajeroRole.id,
        permissionId: perm.id,
      })),
    });
  }

  const autorizadoCodes = [
    ...cajeroCodes,
    'cash_movements:create_expense',
  ];
  const autorizadoPerms = pick(...autorizadoCodes);
  const autorizadoRole = await prisma.role.upsert({
    where: { slug: 'cajero_autorizado' },
    create: {
      name: 'Cajero autorizado (egresos)',
      slug: 'cajero_autorizado',
      description: 'Puede registrar egresos solo si está en la lista de delegados (máx. 3)',
      isSystem: true,
    },
    update: {
      name: 'Cajero autorizado (egresos)',
      description: 'Puede registrar egresos solo si está en la lista de delegados (máx. 3)',
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: autorizadoRole.id } });
  if (autorizadoPerms.length) {
    await prisma.rolePermission.createMany({
      data: autorizadoPerms.map((perm) => ({
        roleId: autorizadoRole.id,
        permissionId: perm.id,
      })),
    });
  }

  // --- Usuario inicial y ajustes del taller (JSON flexible) ---
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@veneautos.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123';
  const hash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: hash,
      fullName: 'Administrador Vene Autos',
      isActive: true,
    },
    update: {
      passwordHash: hash,
      fullName: 'Administrador Vene Autos',
      isActive: true,
    },
  });

  await prisma.userRole.deleteMany({
    where: { userId: adminUser.id, roleId: adminRole.id },
  });
  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: adminRole.id },
  });

  await prisma.workshopSetting.upsert({
    where: { key: 'workshop.name' },
    create: {
      key: 'workshop.name',
      value: 'Vene Autos',
    },
    update: {},
  });

  await prisma.workshopSetting.upsert({
    where: { key: 'workshop.currency' },
    create: {
      key: 'workshop.currency',
      value: 'COP',
    },
    update: {},
  });

  await prisma.workshopSetting.upsert({
    where: { key: 'workshop.timezone' },
    create: {
      key: 'workshop.timezone',
      value: 'America/Bogota',
    },
    update: {},
  });

  await prisma.workshopSetting.upsert({
    where: { key: 'auth.session_idle_timeout_minutes' },
    create: { key: 'auth.session_idle_timeout_minutes', value: 10 },
    update: {},
  });

  await prisma.workshopSetting.upsert({
    where: { key: 'users.create_requires_dueno_role' },
    create: { key: 'users.create_requires_dueno_role', value: false },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log('Seed OK. Admin:', adminEmail, '| Password:', adminPassword);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
