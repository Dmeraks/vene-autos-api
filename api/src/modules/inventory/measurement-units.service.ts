import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeasurementUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.measurementUnit.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }
}
