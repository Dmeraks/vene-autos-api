import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { DebitNotesService } from './debit-notes.service';
import { VoidDebitNoteDto } from './dto/void-debit-note.dto';

@Controller('debit-notes')
export class DebitNotesController {
  constructor(private readonly service: DebitNotesService) {}

  @Get()
  @RequirePermissions('debit_notes:read')
  list(@CurrentUser() actor: JwtUserPayload) {
    return this.service.list(actor);
  }

  @Get(':id')
  @RequirePermissions('debit_notes:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/issue')
  @RequirePermissions('debit_notes:issue')
  issue(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.issue(id, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/void')
  @RequirePermissions('debit_notes:void')
  void(
    @Param('id') id: string,
    @Body() dto: VoidDebitNoteDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.void(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
