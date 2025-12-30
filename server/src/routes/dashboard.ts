/**
 * Dashboard API Routes
 * Provides dashboard statistics and analytics
 */

import express from 'express';
import { getDashboardStats, getQuickStats } from '../services/dashboardStats.js';
import { logAudit } from '../services/auditLog.js';
import { logger } from '../services/logger.js';

const router = express.Router();

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID to get stats for
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employees:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                     recentHires:
 *                       type: number
 *                 companies:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                 payroll:
 *                   type: object
 *                   properties:
 *                     totalYTD:
 *                       type: number
 *                     currentMonth:
 *                       type: number
 *                     lastMonth:
 *                       type: number
 *                     averagePerMonth:
 *                       type: number
 *                     pendingApproval:
 *                       type: number
 *                 taxes:
 *                   type: object
 *                   properties:
 *                     totalYTD:
 *                       type: number
 *                     federal:
 *                       type: number
 *                     state:
 *                       type: number
 *                     fica:
 *                       type: number
 *                     employer:
 *                       type: number
 *                 trends:
 *                   type: object
 *                   properties:
 *                     last6Months:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                           grossPay:
 *                             type: number
 *                           netPay:
 *                             type: number
 *                           taxes:
 *                             type: number
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       date:
 *                         type: string
 *                       id:
 *                         type: string
 *       400:
 *         description: Missing company ID
 *       403:
 *         description: No access to this company
 *       500:
 *         description: Server error
 */
router.get('/stats', async (req, res) => {
  try {
    const { companyId } = req.query;
    const user = (req as any).user;

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    // Verify user has access to this company
    // In production, check user's company access from CompanyAccess table
    // For now, we'll allow access if user is authenticated
    if (user) {
      // TODO: Check if user has access to this company
      // const hasAccess = await checkCompanyAccess(user.id, companyId);
      // if (!hasAccess) {
      //   return res.status(403).json({ error: 'No access to this company' });
      // }
    }

    const stats = await getDashboardStats(companyId);

    // Log audit trail
    await logAudit({
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'VIEWER',
      action: 'VIEW',
      resource: 'DASHBOARD',
      resourceId: companyId,
      companyId,
      description: 'Viewed dashboard statistics',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get dashboard stats', { error });
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
});

/**
 * @swagger
 * /api/dashboard/quick:
 *   get:
 *     summary: Get quick dashboard statistics (lightweight)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID to get stats for
 *     responses:
 *       200:
 *         description: Quick statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeEmployees:
 *                   type: number
 *                 pendingApproval:
 *                   type: number
 *       400:
 *         description: Missing company ID
 *       500:
 *         description: Server error
 */
router.get('/quick', async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const stats = await getQuickStats(companyId);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get quick stats', { error });
    res.status(500).json({ error: 'Failed to get quick statistics' });
  }
});

export default router;
