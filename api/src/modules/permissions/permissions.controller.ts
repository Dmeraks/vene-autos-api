import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions:read')
  findAll() {
    return this.permissions.findAll();
  }
}
