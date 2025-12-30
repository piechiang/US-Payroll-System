/**
 * Reports API Routes
 * Provides various payroll and tax reports
 */

import express from 'express';
import {
  generatePayrollSummaryReport,
  generateTaxSummaryReport,
  generateEmployeeEarningsReport,
  ReportFilters,
} from '../services/reportGenerator.js';
import { logAudit } from '../services/auditLog.js';
import { logger } from '../services/logger.js';

const router = express.Router();

/**
 * @swagger
 * /api/reports/payroll-summary:
 *   post:
 *     summary: Generate payroll summary report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               employeeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               department:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payroll summary report
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/payroll-summary', async (req, res) => {
  try {
    const { companyId, startDate, endDate, employeeIds, department } = req.body;
    const user = (req as any).user;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    // Build filters
    const filters: ReportFilters = {
      companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      employeeIds,
      department,
    };

    const report = await generatePayrollSummaryReport(filters);

    // Log audit trail
    await logAudit({
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'VIEWER',
      action: 'EXPORT',
      resource: 'REPORT',
      resourceId: 'payroll-summary',
      companyId,
      description: 'Generated payroll summary report',
      metadata: JSON.stringify({ startDate, endDate, department }),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json(report);
  } catch (error) {
    logger.error('Failed to generate payroll summary report', { error });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * @swagger
 * /api/reports/tax-summary:
 *   post:
 *     summary: Generate tax summary report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Tax summary report
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/tax-summary', async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.body;
    const user = (req as any).user;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const filters: ReportFilters = {
      companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const report = await generateTaxSummaryReport(filters);

    await logAudit({
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'VIEWER',
      action: 'EXPORT',
      resource: 'REPORT',
      resourceId: 'tax-summary',
      companyId,
      description: 'Generated tax summary report',
      metadata: JSON.stringify({ startDate, endDate }),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json(report);
  } catch (error) {
    logger.error('Failed to generate tax summary report', { error });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * @swagger
 * /api/reports/employee-earnings:
 *   post:
 *     summary: Generate employee earnings report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               employeeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Employee earnings report
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/employee-earnings', async (req, res) => {
  try {
    const { companyId, startDate, endDate, employeeIds } = req.body;
    const user = (req as any).user;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const filters: ReportFilters = {
      companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      employeeIds,
    };

    const report = await generateEmployeeEarningsReport(filters);

    await logAudit({
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'VIEWER',
      action: 'EXPORT',
      resource: 'REPORT',
      resourceId: 'employee-earnings',
      companyId,
      description: 'Generated employee earnings report',
      metadata: JSON.stringify({ startDate, endDate, employeeIds }),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json(report);
  } catch (error) {
    logger.error('Failed to generate employee earnings report', { error });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * @swagger
 * /api/reports/export/csv:
 *   post:
 *     summary: Export report data as CSV
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *               - companyId
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [payroll-summary, tax-summary, employee-earnings]
 *               companyId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/export/csv', async (req, res) => {
  try {
    const { reportType, companyId, startDate, endDate, employeeIds, department } = req.body;
    const user = (req as any).user;

    if (!reportType || !companyId) {
      return res.status(400).json({ error: 'Report type and company ID are required' });
    }

    const filters: ReportFilters = {
      companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      employeeIds,
      department,
    };

    let csvData = '';
    let filename = '';

    switch (reportType) {
      case 'payroll-summary': {
        const report = await generatePayrollSummaryReport(filters);
        filename = `payroll-summary-${companyId}-${Date.now()}.csv`;

        // CSV Header
        csvData = 'Employee Name,Department,Pay Date,Gross Pay,Net Pay,Taxes,Deductions\n';

        // CSV Rows
        report.payrolls.forEach((p) => {
          csvData += `"${p.employeeName}","${p.department}","${p.payDate}",${p.grossPay},${p.netPay},${p.taxes},${p.deductions}\n`;
        });

        // Summary
        csvData += '\n';
        csvData += `Summary,,,,,,\n`;
        csvData += `Total Employees,${report.summary.totalEmployees},,,,\n`;
        csvData += `Total Gross Pay,${report.summary.totalGrossPay},,,,\n`;
        csvData += `Total Net Pay,${report.summary.totalNetPay},,,,\n`;
        csvData += `Total Taxes,${report.summary.totalTaxes},,,,\n`;
        csvData += `Total Deductions,${report.summary.totalDeductions},,,,\n`;
        break;
      }

      case 'tax-summary': {
        const report = await generateTaxSummaryReport(filters);
        filename = `tax-summary-${companyId}-${Date.now()}.csv`;

        csvData = 'Tax Category,Amount\n';
        csvData += `Federal Withholding,${report.federal.federalWithholding}\n`;
        csvData += `Social Security,${report.federal.socialSecurity}\n`;
        csvData += `Medicare,${report.federal.medicare}\n`;
        csvData += `FUTA,${report.federal.futa}\n`;
        csvData += `State Withholding,${report.state.stateWithholding}\n`;
        csvData += `SUI,${report.state.sui}\n`;
        csvData += `SDI,${report.state.sdi}\n`;
        csvData += `Local Withholding,${report.local.localWithholding}\n`;
        csvData += `\n`;
        csvData += `Employee Taxes,${report.totals.employeeTaxes}\n`;
        csvData += `Employer Taxes,${report.totals.employerTaxes}\n`;
        csvData += `Grand Total,${report.totals.grandTotal}\n`;
        break;
      }

      case 'employee-earnings': {
        const report = await generateEmployeeEarningsReport(filters);
        filename = `employee-earnings-${companyId}-${Date.now()}.csv`;

        csvData =
          'Employee Name,SSN,Department,Pay Type,Regular Pay,Overtime,Bonus,Commission,Tips,Gross Pay,Federal Tax,State Tax,FICA,Deductions,Net Pay,YTD Gross,YTD Net\n';

        report.employees.forEach((e) => {
          csvData += `"${e.name}","${e.ssn}","${e.department}","${e.payType}",${e.regularPay},${e.overtimePay},${e.bonus},${e.commission},${e.tips},${e.grossPay},${e.federalTax},${e.stateTax},${e.fica},${e.otherDeductions},${e.netPay},${e.ytdGrossPay},${e.ytdNetPay}\n`;
        });

        csvData += `\n`;
        csvData += `Summary,,,,,,,,,${report.summary.totalGrossPay},,,,,${report.summary.totalNetPay},,\n`;
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Log audit trail
    await logAudit({
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'VIEWER',
      action: 'EXPORT',
      resource: 'REPORT',
      resourceId: reportType,
      companyId,
      description: `Exported ${reportType} report as CSV`,
      metadata: JSON.stringify({ startDate, endDate }),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (error) {
    logger.error('Failed to export CSV', { error });
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

export default router;
