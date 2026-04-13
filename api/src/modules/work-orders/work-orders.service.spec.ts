import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders.query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let prisma: {
    user: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    workOrder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    workOrderPayment: { aggregate: jest.Mock };
  };
  let audit: { recordDomain: jest.Mock };

  const actorId = 'actor-1';

  beforeEach(async () => {
    audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      workOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      workOrderPayment: { aggregate: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(WorkOrdersService);
  });

  describe('create', () => {
    it('rechaza vehículo inexistente', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          actorId,
          { description: 'Cambio de aceite', vehicleId: 'no-existe' } satisfies CreateWorkOrderDto,
          {},
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('rechaza vehículo inactivo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 'v1',
        isActive: false,
        plate: 'X',
        notes: null,
        customer: { displayName: 'A', primaryPhone: null },
      });
      await expect(
        service.create(actorId, { description: 'Trabajo', vehicleId: 'v1' } satisfies CreateWorkOrderDto, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('con vehículo activo conecta y rellena datos desde cliente', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 'v1',
        isActive: true,
        plate: 'ABC123',
        notes: 'Nota veh',
        customer: { displayName: 'Cliente SA', primaryPhone: '311' },
      });
      prisma.workOrder.create.mockResolvedValue({
        id: 'wo1',
        orderNumber: 5,
        status: WorkOrderStatus.RECEIVED,
        description: 'Desc',
        vehicleId: 'v1',
        customerName: 'Cliente SA',
        customerPhone: '311',
        vehiclePlate: 'ABC123',
        vehicleNotes: 'Nota veh',
        authorizedAmount: null,
        createdById: actorId,
        assignedToId: null,
        vehicle: { customer: {} },
      });

      await service.create(
        actorId,
        { description: 'Desc', vehicleId: 'v1' } satisfies CreateWorkOrderDto,
        {},
      );

      expect(prisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicle: { connect: { id: 'v1' } },
            customerName: 'Cliente SA',
            customerPhone: '311',
            vehiclePlate: 'ABC123',
            vehicleNotes: 'Nota veh',
          }),
        }),
      );
    });

    it('valida usuario asignado inactivo', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u99', isActive: false });
      await expect(
        service.create(
          actorId,
          { description: 'X'.repeat(10), assignedToId: 'u99' } satisfies CreateWorkOrderDto,
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('404 si no existe', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('incluye paymentSummary', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        orderNumber: 1,
        status: WorkOrderStatus.RECEIVED,
        description: 'D',
        vehicleId: null,
        customerName: null,
        customerPhone: null,
        vehiclePlate: null,
        vehicleNotes: null,
        internalNotes: null,
        authorizedAmount: new Prisma.Decimal('100'),
        deliveredAt: null,
        createdById: actorId,
        assignedToId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: {},
        assignedTo: null,
        vehicle: null,
        lines: [],
        _count: { payments: 2 },
      });
      prisma.workOrderPayment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('40') },
      });

      const out = await service.findOne('wo1');

      expect(out.paymentSummary).toEqual({
        paymentCount: 2,
        totalPaid: '40',
        remaining: '60.00',
      });
      expect(out.linesSubtotal).toBe('0.00');
      expect(out.lines).toEqual([]);
    });
  });

  describe('update', () => {
    it('rechaza OT entregada', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: new Date(),
        assignedToId: null,
        authorizedAmount: null,
      });
      await expect(
        service.update('wo1', actorId, { description: 'Nuevo texto' } satisfies UpdateWorkOrderDto, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza transición inválida de estado', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.RECEIVED,
        deliveredAt: null,
        assignedToId: null,
        authorizedAmount: null,
      });
      await expect(
        service.update(
          'wo1',
          actorId,
          { status: WorkOrderStatus.DELIVERED } satisfies UpdateWorkOrderDto,
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza tope autorizado menor al cobrado', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.RECEIVED,
        deliveredAt: null,
        assignedToId: null,
        authorizedAmount: new Prisma.Decimal('100'),
      });
      prisma.workOrderPayment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('80') },
      });
      await expect(
        service.update('wo1', actorId, { authorizedAmount: '50' } satisfies UpdateWorkOrderDto, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desvincula vehículo con vehicleId null', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.IN_WORKSHOP,
        deliveredAt: null,
        assignedToId: null,
        authorizedAmount: null,
      });
      prisma.workOrder.update.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.IN_WORKSHOP,
        vehicleId: null,
        orderNumber: 3,
        assignedToId: null,
        authorizedAmount: null,
        createdBy: {},
        assignedTo: null,
        vehicle: null,
      });

      await service.update('wo1', actorId, { vehicleId: null } satisfies UpdateWorkOrderDto, {});

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicle: { disconnect: true },
          }),
        }),
      );
    });

    it('vincula vehículo y sincroniza nombres si no vienen en el DTO', async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.RECEIVED,
        deliveredAt: null,
        assignedToId: null,
        authorizedAmount: null,
      });
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 'v1',
        isActive: true,
        plate: 'XYZ99',
        customer: { displayName: 'Sync Co', primaryPhone: '999' },
      });
      prisma.workOrder.update.mockResolvedValue({
        id: 'wo1',
        status: WorkOrderStatus.RECEIVED,
        vehicleId: 'v1',
        orderNumber: 1,
        assignedToId: null,
        authorizedAmount: null,
        createdBy: {},
        assignedTo: null,
        vehicle: { customer: {} },
      });

      await service.update('wo1', actorId, { vehicleId: 'v1' } satisfies UpdateWorkOrderDto, {});

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicle: { connect: { id: 'v1' } },
            customerName: 'Sync Co',
            customerPhone: '999',
            vehiclePlate: 'XYZ99',
          }),
        }),
      );
    });
  });

  describe('list', () => {
    it('filtra por vehicleId cuando viene en query', async () => {
      prisma.workOrder.findMany.mockResolvedValue([]);
      await service.list(actorId, { vehicleId: 'v-uuid' } satisfies ListWorkOrdersQueryDto);
      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vehicleId: 'v-uuid' }),
        }),
      );
    });
  });
});
