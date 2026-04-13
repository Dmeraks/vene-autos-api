import { Global, Module } from '@nestjs/common';
import { NotesPolicyService } from './notes-policy.service';

@Global()
@Module({
  providers: [NotesPolicyService],
  exports: [NotesPolicyService],
})
export class NotesPolicyModule {}
