import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: {
    customer: { findUnique: jest.Mock };
    vehicle: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    workOrder: { findMany: jest.Mock };
  };
  let audit: { recordDomain: jest.Mock };
  let workOrders: { workOrderVisibilityWhere: jest.Mock };

  const jwtActor = (sub: string): JwtUserPayload => ({
    sub,
    sid: 's',
    email: 't@t.c',
    fullName: 'T',
    permissions: [],
  });

  beforeEach(async () => {
    audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
    workOrders = { workOrderVisibilityWhere: jest.fn().mockReturnValue({ createdById: 'u1' }) };
    prisma = {
      customer: { findUnique: jest.fn() },
      vehicle: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      workOrder: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WorkOrdersService, useValue: workOrders },
      ],
    }).compile();

    service = moduleRef.get(VehiclesService);
  });

  it('create rechaza cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(
      service.create('u1', { customerId: 'c', plate: 'ABC123' }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rechaza cliente inactivo', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c', isActive: false });
    await expect(
      service.create('u1', { customerId: 'c', plate: 'ABC123' }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create mapea P2002 a ConflictException', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c', isActive: true });
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.vehicle.create.mockRejectedValue(err);

    await expect(
      service.create('u1', { customerId: 'c', plate: 'ABC 123' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update rechaza sin campos', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'v1', plateNorm: 'X', isActive: true });
    await expect(service.update('v1', 'u1', {}, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listWorkOrders ordena por fecha descendente', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prisma.workOrder.findMany.mockResolvedValue([]);

    await service.listWorkOrders('v1', jwtActor('u1'));

    expect(workOrders.workOrderVisibilityWhere).toHaveBeenCalledWith(jwtActor('u1'));
    expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vehicleId: 'v1', createdById: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  });
});
