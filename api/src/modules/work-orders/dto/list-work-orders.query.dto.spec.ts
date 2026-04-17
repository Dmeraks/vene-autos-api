import { validate } from 'class-validator';
import { ListWorkOrdersQueryDto } from './list-work-orders.query.dto';

describe('ListWorkOrdersQueryDto', () => {
  it('acepta `_` opcional (cache-bust); sin eso el ValidationPipe global devolvía 400 con forbidNonWhitelisted', async () => {
    const dto = Object.assign(new ListWorkOrdersQueryDto(), { _: String(Date.now()) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta page y pageSize numéricos', async () => {
    const dto = Object.assign(new ListWorkOrdersQueryDto(), { page: 2, pageSize: 24 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta customerId (cuid)', async () => {
    const dto = Object.assign(new ListWorkOrdersQueryDto(), {
      customerId: 'clh8y2q3n0001u9m2k7v1abcd',
      _: String(Date.now()),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
