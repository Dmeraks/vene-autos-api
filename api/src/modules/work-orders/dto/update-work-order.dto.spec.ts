import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWorkOrderDto } from './update-work-order.dto';

describe('UpdateWorkOrderDto', () => {
  it('acepta assignedToId como cuid Prisma (no UUID)', async () => {
    const dto = plainToInstance(UpdateWorkOrderDto, {
      assignedToId: 'clh8y2q3n0000u9m2k7v1abcd',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta vehicleId como cuid Prisma', async () => {
    const dto = plainToInstance(UpdateWorkOrderDto, {
      vehicleId: 'clh8y2q3n0001u9m2k7v1abcd',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rechaza assignedToId vacío', async () => {
    const dto = plainToInstance(UpdateWorkOrderDto, {
      assignedToId: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
