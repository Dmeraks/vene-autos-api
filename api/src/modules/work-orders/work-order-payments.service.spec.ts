import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CashMovementDirection,
  CashSessionStatus,
  Prisma,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WorkOrderPaymentsService } from './work-order-payments.service';

const WO_ID = 'clwo0000000000000000000001';
const USER_ID = 'clusr000000000000000000001';

describe('WorkOrderPaymentsService', () => {
  let service: WorkOrderPaymentsService;
  let prisma: { $transaction: jest.Mock };
  let audit: { recordDomain: jest.Mock };

  function makeTx(setup: {
    wo?: {
      id: string;
      orderNumber: number;
      status: WorkOrderStatus;
      authorizedAmount: Prisma.Decimal | null;
    } | null;
    paidSum?: Prisma.Decimal | null;
    session?: { id: string } | null;
    category?: { id: string; slug: string; direction: CashMovementDirection } | null;
    categoryDirection?: CashMovementDirection;
  }) {
    const movement = {
      id: 'mov-1',
      category: { slug: 'ingreso_cobro' },
      createdBy: { id: USER_ID, email: 'a@b.c', fullName: 'Test' },
    };
    const payment = {
      id: 'pay-1',
      recordedBy: { id: USER_ID, email: 'a@b.c', fullName: 'Test' },
      cashMovement: { category: { slug: 'ingreso_cobro' } },
    };

    return {
      $executeRaw: jest.fn().mockResolvedValue(1),
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(setup.wo ?? null),
      },
      workOrderPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: setup.paidSum ?? null } }),
        create: jest.fn().mockResolvedValue(payment),
      },
      cashSession: {
        findFirst: jest.fn().mockImplementation(async (args: { where: { status: string } }) => {
          if (args.where.status === CashSessionStatus.OPEN) {
            return setup.session === undefined ? { id: 'sess-1' } : setup.session;
          }
          return null;
        }),
      },
      cashMovementCategory: {
        findUnique: jest.fn().mockImplementation(async () => {
          if (setup.category === null) {
            return null;
          }
          if (setup.category) {
            return setup.category;
          }
          return {
            id: 'cat-1',
            slug: 'ingreso_cobro',
            direction: setup.categoryDirection ?? CashMovementDirection.INCOME,
          };
        }),
      },
      cashMovement: {
        create: jest.fn().mockResolvedValue(movement),
      },
    };
  }

  beforeEach(async () => {
    audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkOrderPaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(WorkOrderPaymentsService);
  });

  it('rechaza monto cero sin abrir transacción', async () => {
    await expect(
      service.record(WO_ID, USER_ID, { amount: '0' }, { ip: undefined, userAgent: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza OT cancelada', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 1,
            status: WorkOrderStatus.CANCELLED,
            authorizedAmount: null,
          },
        }),
      ),
    );

    await expect(
      service.record(WO_ID, USER_ID, { amount: '10' }, { ip: undefined, userAgent: undefined }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza si supera authorizedAmount', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 1,
            status: WorkOrderStatus.RECEIVED,
            authorizedAmount: new Prisma.Decimal('100'),
          },
          paidSum: new Prisma.Decimal('80'),
        }),
      ),
    );

    await expect(
      service.record(WO_ID, USER_ID, { amount: '30' }, { ip: undefined, userAgent: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza sin sesión de caja abierta', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 1,
            status: WorkOrderStatus.RECEIVED,
            authorizedAmount: null,
          },
          session: null,
        }),
      ),
    );

    await expect(
      service.record(WO_ID, USER_ID, { amount: '10' }, { ip: undefined, userAgent: undefined }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza categoría inexistente', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 1,
            status: WorkOrderStatus.RECEIVED,
            authorizedAmount: null,
          },
          category: null,
        }),
      ),
    );

    await expect(
      service.record(WO_ID, USER_ID, { amount: '10', categorySlug: 'no_existe' }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza categoría que no es ingreso', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 1,
            status: WorkOrderStatus.RECEIVED,
            authorizedAmount: null,
          },
          categoryDirection: CashMovementDirection.EXPENSE,
        }),
      ),
    );

    await expect(
      service.record(WO_ID, USER_ID, { amount: '10' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registra cobro y audita dos eventos', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(
        makeTx({
          wo: {
            id: WO_ID,
            orderNumber: 7,
            status: WorkOrderStatus.RECEIVED,
            authorizedAmount: new Prisma.Decimal('500'),
          },
          paidSum: new Prisma.Decimal('100'),
        }),
      ),
    );

    const out = await service.record(WO_ID, USER_ID, { amount: '50.00', note: ' test ' }, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(out.id).toBe('pay-1');
    expect(audit.recordDomain).toHaveBeenCalledTimes(2);
    expect(audit.recordDomain.mock.calls[0][0].action).toBe('work_orders.payment_recorded');
    expect(audit.recordDomain.mock.calls[1][0].action).toBe('cash_movements.income');
  });
});
