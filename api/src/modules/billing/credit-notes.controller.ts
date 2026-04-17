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
import { CreditNotesService } from './credit-notes.service';
import { VoidCreditNoteDto } from './dto/void-credit-note.dto';

@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly service: CreditNotesService) {}

  @Get()
  @RequirePermissions('credit_notes:read')
  list(@CurrentUser() actor: JwtUserPayload) {
    return this.service.list(actor);
  }

  @Get(':id')
  @RequirePermissions('credit_notes:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/issue')
  @RequirePermissions('credit_notes:issue')
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
  @RequirePermissions('credit_notes:void')
  void(
    @Param('id') id: string,
    @Body() dto: VoidCreditNoteDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.void(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
