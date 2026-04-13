import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: {
    customer: { findUnique: jest.Mock };
    vehicle: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    workOrder: { findMany: jest.Mock };
  };
  let audit: { recordDomain: jest.Mock };

  beforeEach(async () => {
    audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
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

    await service.listWorkOrders('v1');

    expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vehicleId: 'v1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  });
});
