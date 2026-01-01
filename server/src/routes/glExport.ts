import { Router, Request, Response } from 'express';
import { GLExportService } from '../services/glExportService.js';
import { AppError } from '../utils/AppError.js';
import { AuditLogger, AuditAction, AuditEntity } from '../services/auditLogger.js';

const router = Router();

// GET /api/gl-export/quickbooks-csv
router.get('/quickbooks-csv', async (req: Request, res: Response) => {
  try {
    const { companyId, payPeriodStart, payPeriodEnd } = req.query;

    if (!companyId || !payPeriodStart || !payPeriodEnd) {
      throw AppError.badRequest('Missing required parameters: companyId, payPeriodStart, payPeriodEnd');
    }

    const startDate = new Date(payPeriodStart as string);
    const endDate = new Date(payPeriodEnd as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw AppError.badRequest('Invalid date format');
    }

    // Generate CSV
    const csv = await GLExportService.generateQuickBooksCSV(
      String(companyId),
      startDate,
      endDate
    );

    // Audit log the export
    const userId = (req as any).user?.id || 'system';
    await AuditLogger.log({
      userId,
      companyId: String(companyId),
      action: AuditAction.EXPORT,
      entity: AuditEntity.PAYROLL,
      entityId: `${companyId}-${payPeriodStart}-${payPeriodEnd}`,
      metadata: {
        exportType: 'QuickBooks CSV',
        payPeriodStart: payPeriodStart,
        payPeriodEnd: payPeriodEnd
      }
    });

    // Set headers for CSV download
    const filename = `payroll-gl-${payPeriodStart}-${payPeriodEnd}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw AppError.internal('Failed to generate QuickBooks CSV export');
  }
});

// GET /api/gl-export/quickbooks-iif
router.get('/quickbooks-iif', async (req: Request, res: Response) => {
  try {
    const { companyId, payPeriodStart, payPeriodEnd } = req.query;

    if (!companyId || !payPeriodStart || !payPeriodEnd) {
      throw AppError.badRequest('Missing required parameters: companyId, payPeriodStart, payPeriodEnd');
    }

    const startDate = new Date(payPeriodStart as string);
    const endDate = new Date(payPeriodEnd as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw AppError.badRequest('Invalid date format');
    }

    // Generate IIF
    const iif = await GLExportService.generateQuickBooksIIF(
      String(companyId),
      startDate,
      endDate
    );

    // Audit log the export
    const userId = (req as any).user?.id || 'system';
    await AuditLogger.log({
      userId,
      companyId: String(companyId),
      action: AuditAction.EXPORT,
      entity: AuditEntity.PAYROLL,
      entityId: `${companyId}-${payPeriodStart}-${payPeriodEnd}`,
      metadata: {
        exportType: 'QuickBooks IIF',
        payPeriodStart: payPeriodStart,
        payPeriodEnd: payPeriodEnd
      }
    });

    // Set headers for IIF download
    const filename = `payroll-gl-${payPeriodStart}-${payPeriodEnd}.iif`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(iif);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw AppError.internal('Failed to generate QuickBooks IIF export');
  }
});

// GET /api/gl-export/formats
router.get('/formats', (_req: Request, res: Response) => {
  res.json({
    formats: [
      {
        id: 'quickbooks-csv',
        name: 'QuickBooks Online (CSV)',
        description: 'Standard CSV format compatible with QuickBooks Online',
        endpoint: '/api/gl-export/quickbooks-csv',
        fileExtension: '.csv'
      },
      {
        id: 'quickbooks-iif',
        name: 'QuickBooks Desktop (IIF)',
        description: 'Intuit Interchange Format for QuickBooks Desktop',
        endpoint: '/api/gl-export/quickbooks-iif',
        fileExtension: '.iif'
      }
    ]
  });
});

export default router;
