/**
 * Payroll Approval Workflow Routes
 *
 * Implements a multi-step approval process for payroll runs:
 * 1. DRAFT - Payroll data entered, not yet submitted
 * 2. PENDING_APPROVAL - Submitted for review by authorized approver
 * 3. APPROVED - Approved by manager/admin, ready to process
 * 4. PROCESSING - Currently being processed
 * 5. PROCESSED - Calculations complete, ready for payment
 * 6. PAID - Funds distributed
 *
 * Also supports:
 * - REJECTED - Sent back for revision with notes
 * - VOID - Cancelled payroll
 */

import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import { AuthRequest, authorizeRoles, hasCompanyAccess } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = Router();

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'VOID'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'VOID'],
  REJECTED: ['PENDING_APPROVAL', 'VOID'],
  APPROVED: ['PROCESSING', 'VOID'],
  PROCESSING: ['PROCESSED'],
  PROCESSED: ['PAID', 'VOID'],
  PAID: [], // Terminal state
  VOID: []  // Terminal state
};

// Roles that can approve payroll
const APPROVER_ROLES = ['ADMIN', 'MANAGER'];

/**
 * GET /api/payroll-approval/pending
 * Get all payroll periods pending approval for accessible companies
 */
router.get('/pending', authorizeRoles('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query;

    const where: any = {
      status: 'PENDING_APPROVAL'
    };

    if (companyId) {
      if (!hasCompanyAccess(req, String(companyId))) {
        return res.status(403).json({ error: 'Access denied to this company' });
      }
      where.companyId = String(companyId);
    } else if (req.accessibleCompanyIds && req.accessibleCompanyIds.length > 0) {
      where.companyId = { in: req.accessibleCompanyIds };
    }

    const pendingPayrolls = await prisma.payPeriod.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, ein: true }
        },
        payrolls: {
          select: {
            id: true,
            grossPay: true,
            netPay: true,
            totalDeductions: true,
            employee: {
              select: { id: true, firstName: true, lastName: true }
            }
          }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });

    // Calculate summary for each period
    const results = pendingPayrolls.map(period => {
      const totalGross = period.payrolls.reduce((sum, p) => sum + Number(p.grossPay), 0);
      const totalNet = period.payrolls.reduce((sum, p) => sum + Number(p.netPay), 0);
      const totalDeductions = period.payrolls.reduce((sum, p) => sum + Number(p.totalDeductions), 0);

      return {
        id: period.id,
        company: period.company,
        startDate: period.startDate,
        endDate: period.endDate,
        payDate: period.payDate,
        status: period.status,
        submittedBy: period.submittedBy,
        submittedAt: period.submittedAt,
        employeeCount: period.payrolls.length,
        summary: {
          totalGrossPay: Math.round(totalGross * 100) / 100,
          totalNetPay: Math.round(totalNet * 100) / 100,
          totalDeductions: Math.round(totalDeductions * 100) / 100
        }
      };
    });

    res.json({
      count: results.length,
      pendingApprovals: results
    });
  } catch (error) {
    logger.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

/**
 * GET /api/payroll-approval/:id
 * Get detailed view of a payroll period for approval
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id },
      include: {
        company: {
          select: { id: true, name: true, ein: true }
        },
        payrolls: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                department: true,
                payType: true
              }
            }
          }
        }
      }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate detailed summary
    const summary = {
      totalEmployees: period.payrolls.length,
      totalGrossPay: 0,
      totalNetPay: 0,
      totalFederalTax: 0,
      totalStateTax: 0,
      totalLocalTax: 0,
      totalSocialSecurity: 0,
      totalMedicare: 0,
      total401k: 0,
      totalEmployerTax: 0
    };

    const employeeDetails = period.payrolls.map(p => {
      summary.totalGrossPay += Number(p.grossPay);
      summary.totalNetPay += Number(p.netPay);
      summary.totalFederalTax += Number(p.federalWithholding);
      summary.totalStateTax += Number(p.stateWithholding);
      summary.totalLocalTax += Number(p.localWithholding);
      summary.totalSocialSecurity += Number(p.socialSecurity);
      summary.totalMedicare += Number(p.medicare);
      summary.total401k += Number(p.retirement401k);
      summary.totalEmployerTax += Number(p.totalEmployerTax);

      return {
        employeeId: p.employee.id,
        employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
        department: p.employee.department,
        payType: p.employee.payType,
        regularHours: Number(p.regularHours),
        overtimeHours: Number(p.overtimeHours),
        grossPay: Number(p.grossPay),
        netPay: Number(p.netPay),
        federalTax: Number(p.federalWithholding),
        stateTax: Number(p.stateWithholding),
        socialSecurity: Number(p.socialSecurity),
        medicare: Number(p.medicare),
        retirement401k: Number(p.retirement401k),
        totalDeductions: Number(p.totalDeductions)
      };
    });

    // Round summary values
    for (const key of Object.keys(summary) as (keyof typeof summary)[]) {
      if (key !== 'totalEmployees') {
        summary[key] = Math.round(summary[key] * 100) / 100;
      }
    }

    res.json({
      id: period.id,
      company: period.company,
      startDate: period.startDate,
      endDate: period.endDate,
      payDate: period.payDate,
      status: period.status,
      workflow: {
        submittedBy: period.submittedBy,
        submittedAt: period.submittedAt,
        approvedBy: period.approvedBy,
        approvedAt: period.approvedAt,
        rejectedBy: period.rejectedBy,
        rejectedAt: period.rejectedAt,
        rejectionNote: period.rejectionNote
      },
      summary,
      employees: employeeDetails,
      allowedTransitions: STATUS_TRANSITIONS[period.status] || []
    });
  } catch (error) {
    logger.error('Error fetching payroll details:', error);
    res.status(500).json({ error: 'Failed to fetch payroll details' });
  }
});

/**
 * POST /api/payroll-approval/:id/submit
 * Submit a payroll period for approval
 */
router.post('/:id/submit', authorizeRoles('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res: Response) => {
  try {
    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status transition
    if (!STATUS_TRANSITIONS[period.status]?.includes('PENDING_APPROVAL')) {
      return res.status(400).json({
        error: 'Invalid status transition',
        currentStatus: period.status,
        allowedTransitions: STATUS_TRANSITIONS[period.status]
      });
    }

    // Check if there are payrolls to approve
    const payrollCount = await prisma.payroll.count({
      where: { payPeriodId: period.id }
    });

    if (payrollCount === 0) {
      return res.status(400).json({
        error: 'Cannot submit empty payroll',
        message: 'No payroll records found for this pay period'
      });
    }

    const updated = await prisma.payPeriod.update({
      where: { id: period.id },
      data: {
        status: 'PENDING_APPROVAL',
        submittedBy: req.user?.userId,
        submittedAt: new Date(),
        // Clear any previous rejection
        rejectedBy: null,
        rejectedAt: null,
        rejectionNote: null
      }
    });

    res.json({
      message: 'Payroll submitted for approval',
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submittedAt
    });
  } catch (error) {
    logger.error('Error submitting payroll:', error);
    res.status(500).json({ error: 'Failed to submit payroll for approval' });
  }
});

/**
 * POST /api/payroll-approval/:id/approve
 * Approve a pending payroll
 */
router.post('/:id/approve', authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status transition
    if (period.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({
        error: 'Invalid status transition',
        message: 'Only payrolls with PENDING_APPROVAL status can be approved',
        currentStatus: period.status
      });
    }

    // Cannot approve your own submission (separation of duties)
    if (period.submittedBy === req.user?.userId) {
      return res.status(403).json({
        error: 'Cannot approve own submission',
        message: 'A different authorized user must approve this payroll'
      });
    }

    const updated = await prisma.payPeriod.update({
      where: { id: period.id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user?.userId,
        approvedAt: new Date()
      }
    });

    res.json({
      message: 'Payroll approved',
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt
    });
  } catch (error) {
    logger.error('Error approving payroll:', error);
    res.status(500).json({ error: 'Failed to approve payroll' });
  }
});

/**
 * POST /api/payroll-approval/:id/reject
 * Reject a pending payroll with notes
 */
router.post('/:id/reject', authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      note: z.string().min(1, 'Rejection reason is required').max(1000)
    });

    const { note } = schema.parse(req.body);

    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status transition
    if (period.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({
        error: 'Invalid status transition',
        message: 'Only payrolls with PENDING_APPROVAL status can be rejected',
        currentStatus: period.status
      });
    }

    const updated = await prisma.payPeriod.update({
      where: { id: period.id },
      data: {
        status: 'REJECTED',
        rejectedBy: req.user?.userId,
        rejectedAt: new Date(),
        rejectionNote: note
      }
    });

    res.json({
      message: 'Payroll rejected',
      id: updated.id,
      status: updated.status,
      rejectedAt: updated.rejectedAt,
      note: updated.rejectionNote
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error rejecting payroll:', error);
    res.status(500).json({ error: 'Failed to reject payroll' });
  }
});

/**
 * POST /api/payroll-approval/:id/void
 * Void/cancel a payroll period
 */
router.post('/:id/void', authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      reason: z.string().min(1, 'Void reason is required').max(1000)
    });

    const { reason } = schema.parse(req.body);

    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Cannot void already paid payroll
    if (period.status === 'PAID') {
      return res.status(400).json({
        error: 'Cannot void paid payroll',
        message: 'Payroll has already been paid. Create adjustments instead.'
      });
    }

    if (period.status === 'VOID') {
      return res.status(400).json({
        error: 'Already voided',
        message: 'This payroll period is already voided'
      });
    }

    // Void the pay period and all associated payrolls
    const [updatedPeriod] = await prisma.$transaction([
      prisma.payPeriod.update({
        where: { id: period.id },
        data: {
          status: 'VOID',
          rejectionNote: `VOIDED: ${reason}`
        }
      }),
      prisma.payroll.updateMany({
        where: { payPeriodId: period.id },
        data: { status: 'VOID' }
      })
    ]);

    res.json({
      message: 'Payroll voided',
      id: updatedPeriod.id,
      status: updatedPeriod.status,
      reason
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error voiding payroll:', error);
    res.status(500).json({ error: 'Failed to void payroll' });
  }
});

/**
 * GET /api/payroll-approval/history
 * Get approval history for a company
 */
router.get('/history/:companyId', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { limit = '20', offset = '0', status } = req.query;

    if (!hasCompanyAccess(req, companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where: any = { companyId };
    if (status) {
      where.status = String(status);
    }

    const [periods, total] = await Promise.all([
      prisma.payPeriod.findMany({
        where,
        include: {
          payrolls: {
            select: {
              grossPay: true,
              netPay: true
            }
          }
        },
        orderBy: { payDate: 'desc' },
        take: parseInt(String(limit)),
        skip: parseInt(String(offset))
      }),
      prisma.payPeriod.count({ where })
    ]);

    const results = periods.map(period => ({
      id: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      payDate: period.payDate,
      status: period.status,
      employeeCount: period.payrolls.length,
      totalGrossPay: Math.round(period.payrolls.reduce((sum, p) => sum + Number(p.grossPay), 0) * 100) / 100,
      totalNetPay: Math.round(period.payrolls.reduce((sum, p) => sum + Number(p.netPay), 0) * 100) / 100,
      workflow: {
        submittedBy: period.submittedBy,
        submittedAt: period.submittedAt,
        approvedBy: period.approvedBy,
        approvedAt: period.approvedAt,
        rejectedBy: period.rejectedBy,
        rejectedAt: period.rejectedAt,
        rejectionNote: period.rejectionNote
      }
    }));

    res.json({
      total,
      limit: parseInt(String(limit)),
      offset: parseInt(String(offset)),
      history: results
    });
  } catch (error) {
    logger.error('Error fetching approval history:', error);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

export default router;
