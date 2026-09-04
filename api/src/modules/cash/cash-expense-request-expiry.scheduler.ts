/**
 * Tarea ligera: persiste EXPIRED en solicitudes vencidas para que listados y políticas coincidan con BD.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CashExpenseRequestsService } from './cash-expense-requests.service';

@Injectable()
export class CashExpenseRequestExpiryScheduler {
  private readonly logger = new Logger(CashExpenseRequestExpiryScheduler.name);

  constructor(private readonly requests: CashExpenseRequestsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStalePending(): Promise<void> {
    try {
      const n = await this.requests.flushExpiredPendingRequests();
      if (n > 0) {
        this.logger.log(`Solicitudes de egreso marcadas como EXPIRED: ${n}`);
      }
    } catch (err) {
      this.logger.error('Fallo al expirar solicitudes de egreso', err as Error);
    }
  }
}
