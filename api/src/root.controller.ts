import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

/** Raíz del prefijo global `api/v1` (evita 404 confuso en navegador). */
@Controller()
export class RootController {
  @Public()
  @Get()
  root() {
    return {
      service: 'vene-autos-api',
      phase: 3,
      links: {
        health: '/api/v1/health',
        authLogin: 'POST /api/v1/auth/login',
        authLogout: 'POST /api/v1/auth/logout',
        workOrders: 'GET/POST /api/v1/work-orders',
        workOrderById: 'GET/PATCH /api/v1/work-orders/:id',
        workOrderPayments: 'GET /api/v1/work-orders/:id/payments',
        workOrderSummary: 'GET /api/v1/work-orders/:id/summary',
        workOrderRecordPayment: 'POST /api/v1/work-orders/:id/payments',
        cashCategories: 'GET /api/v1/cash/categories',
        cashSessionCurrent: 'GET /api/v1/cash/sessions/current',
        cashSessionOpen: 'POST /api/v1/cash/sessions/open',
        cashMovementIncome: 'POST /api/v1/cash/movements/income',
        cashMovementExpense: 'POST /api/v1/cash/movements/expense',
        cashDelegates: 'GET/PUT /api/v1/cash/delegates',
        cashExpenseRequests: 'GET/POST /api/v1/cash/expense-requests',
        cashExpenseRequestApprove: 'POST /api/v1/cash/expense-requests/:id/approve',
        cashExpenseRequestReject: 'POST /api/v1/cash/expense-requests/:id/reject',
        cashExpenseRequestCancel: 'POST /api/v1/cash/expense-requests/:id/cancel',
      },
    };
  }
}
