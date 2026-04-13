import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: {
    customer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { recordDomain: jest.Mock };

  beforeEach(async () => {
    audit = { recordDomain: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  it('create persiste y audita', async () => {
    prisma.customer.create.mockResolvedValue({
      id: 'c1',
      displayName: 'Juan Pérez',
      primaryPhone: '300',
      email: null,
      documentId: null,
      notes: null,
      isActive: true,
    });

    const out = await service.create('u1', { displayName: '  Juan Pérez  ', primaryPhone: '300' }, {});

    expect(out.id).toBe('c1');
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        displayName: 'Juan Pérez',
        primaryPhone: '300',
        email: null,
        documentId: null,
        notes: null,
      },
    });
    expect(audit.recordDomain).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'customers.created', entityId: 'c1' }),
    );
  });

  it('findOne lanza si no existe', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update rechaza cuerpo vacío', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', displayName: 'A', isActive: true });
    await expect(service.update('c1', 'u1', {}, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listVehicles lanza si cliente no existe', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.listVehicles('bad')).rejects.toBeInstanceOf(NotFoundException);
  });
});
