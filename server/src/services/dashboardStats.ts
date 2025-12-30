/**
 * Dashboard Statistics Service
 * Provides comprehensive statistics and analytics for the dashboard
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { getFromCache, setInCache } from './cache.js';

const prisma = new PrismaClient();

interface DashboardStats {
  employees: {
    total: number;
    active: number;
    inactive: number;
    recentHires: number; // Last 30 days
  };
  companies: {
    total: number;
    active: number;
  };
  payroll: {
    totalYTD: number;
    currentMonth: number;
    lastMonth: number;
    averagePerMonth: number;
    pendingApproval: number;
  };
  taxes: {
    totalYTD: number;
    federal: number;
    state: number;
    fica: number;
    employer: number;
  };
  trends: {
    last6Months: Array<{
      month: string;
      grossPay: number;
      netPay: number;
      taxes: number;
    }>;
  };
  recentActivity: Array<{
    type: 'payroll' | 'employee' | 'company';
    description: string;
    date: string;
    id: string;
  }>;
}

/**
 * Get comprehensive dashboard statistics for a company
 */
export async function getDashboardStats(companyId: string): Promise<DashboardStats> {
  const cacheKey = `dashboard:stats:${companyId}`;

  // Try to get from cache (5 minute TTL)
  const cached = getFromCache<DashboardStats>(cacheKey);
  if (cached) {
    logger.info('Dashboard stats served from cache', { companyId });
    return cached;
  }

  logger.info('Computing dashboard stats', { companyId });

  try {
    // Get current year boundaries
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const now = new Date();

    // Calculate month boundaries
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [
      employeeStats,
      companyStats,
      payrollYTD,
      payrollCurrentMonth,
      payrollLastMonth,
      pendingApproval,
      recentEmployees,
      recentPayrolls,
      last6MonthsData
    ] = await Promise.all([
      // Employee statistics
      prisma.employee.groupBy({
        by: ['isActive'],
        where: { companyId },
        _count: true
      }),

      // Company statistics (for multi-company users)
      prisma.company.aggregate({
        where: { id: companyId },
        _count: true
      }),

      // Payroll YTD totals
      prisma.payroll.aggregate({
        where: {
          companyId,
          payDate: { gte: yearStart }
        },
        _sum: {
          grossPay: true,
          netPay: true,
          federalWithholding: true,
          socialSecurity: true,
          medicare: true,
          stateWithholding: true,
          localWithholding: true,
          totalEmployerTax: true
        }
      }),

      // Current month payroll
      prisma.payroll.aggregate({
        where: {
          companyId,
          payDate: { gte: currentMonthStart }
        },
        _sum: { grossPay: true }
      }),

      // Last month payroll
      prisma.payroll.aggregate({
        where: {
          companyId,
          payDate: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        _sum: { grossPay: true }
      }),

      // Pending approval count
      prisma.payPeriod.count({
        where: {
          companyId,
          status: 'PENDING_APPROVAL'
        }
      }),

      // Recent employees (last 30 days)
      prisma.employee.findMany({
        where: {
          companyId,
          hireDate: { gte: thirtyDaysAgo }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          hireDate: true
        },
        orderBy: { hireDate: 'desc' },
        take: 5
      }),

      // Recent payrolls
      prisma.payroll.findMany({
        where: { companyId },
        select: {
          id: true,
          payDate: true,
          grossPay: true,
          employee: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { payDate: 'desc' },
        take: 10
      }),

      // Last 6 months trend data
      get6MonthsTrend(companyId)
    ]);

    // Process employee stats
    const activeEmployees = employeeStats.find(s => s.isActive)?._count || 0;
    const inactiveEmployees = employeeStats.find(s => !s.isActive)?._count || 0;
    const totalEmployees = activeEmployees + inactiveEmployees;

    // Process payroll stats
    const totalYTD = Number(payrollYTD._sum.grossPay || 0);
    const currentMonth = Number(payrollCurrentMonth._sum.grossPay || 0);
    const lastMonth = Number(payrollLastMonth._sum.grossPay || 0);

    // Calculate average per month (based on months elapsed this year)
    const monthsElapsed = now.getMonth() + 1;
    const averagePerMonth = monthsElapsed > 0 ? totalYTD / monthsElapsed : 0;

    // Process tax stats
    const federalTax = Number(payrollYTD._sum.federalWithholding || 0);
    const socialSecurity = Number(payrollYTD._sum.socialSecurity || 0);
    const medicare = Number(payrollYTD._sum.medicare || 0);
    const stateTax = Number(payrollYTD._sum.stateWithholding || 0);
    const localTax = Number(payrollYTD._sum.localWithholding || 0);
    const employerTax = Number(payrollYTD._sum.totalEmployerTax || 0);

    const ficaTax = socialSecurity + medicare;
    const totalTaxes = federalTax + ficaTax + stateTax + localTax;

    // Process recent activity
    const recentActivity = [
      ...recentEmployees.map(emp => ({
        type: 'employee' as const,
        description: `${emp.firstName} ${emp.lastName} hired`,
        date: emp.hireDate.toISOString(),
        id: emp.id
      })),
      ...recentPayrolls.map(pr => ({
        type: 'payroll' as const,
        description: `Payroll: ${pr.employee.firstName} ${pr.employee.lastName} - $${Number(pr.grossPay).toFixed(2)}`,
        date: pr.payDate.toISOString(),
        id: pr.id
      }))
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    // Build response
    const stats: DashboardStats = {
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        inactive: inactiveEmployees,
        recentHires: recentEmployees.length
      },
      companies: {
        total: 1, // Current company
        active: 1
      },
      payroll: {
        totalYTD: Math.round(totalYTD * 100) / 100,
        currentMonth: Math.round(currentMonth * 100) / 100,
        lastMonth: Math.round(lastMonth * 100) / 100,
        averagePerMonth: Math.round(averagePerMonth * 100) / 100,
        pendingApproval
      },
      taxes: {
        totalYTD: Math.round(totalTaxes * 100) / 100,
        federal: Math.round(federalTax * 100) / 100,
        state: Math.round(stateTax * 100) / 100,
        fica: Math.round(ficaTax * 100) / 100,
        employer: Math.round(employerTax * 100) / 100
      },
      trends: {
        last6Months: last6MonthsData
      },
      recentActivity
    };

    // Cache for 5 minutes
    setInCache(cacheKey, stats, 300);

    logger.info('Dashboard stats computed successfully', {
      companyId,
      employeeCount: totalEmployees,
      payrollYTD: totalYTD
    });

    return stats;
  } catch (error) {
    logger.error('Failed to compute dashboard stats', { companyId, error });
    throw error;
  }
}

/**
 * Get 6 months trend data
 */
async function get6MonthsTrend(companyId: string) {
  const now = new Date();
  const trends = [];

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    const monthData = await prisma.payroll.aggregate({
      where: {
        companyId,
        payDate: {
          gte: monthStart,
          lte: monthEnd
        }
      },
      _sum: {
        grossPay: true,
        netPay: true,
        federalWithholding: true,
        socialSecurity: true,
        medicare: true,
        stateWithholding: true,
        localWithholding: true
      }
    });

    const grossPay = Number(monthData._sum.grossPay || 0);
    const netPay = Number(monthData._sum.netPay || 0);
    const taxes =
      Number(monthData._sum.federalWithholding || 0) +
      Number(monthData._sum.socialSecurity || 0) +
      Number(monthData._sum.medicare || 0) +
      Number(monthData._sum.stateWithholding || 0) +
      Number(monthData._sum.localWithholding || 0);

    trends.push({
      month: monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
      grossPay: Math.round(grossPay * 100) / 100,
      netPay: Math.round(netPay * 100) / 100,
      taxes: Math.round(taxes * 100) / 100
    });
  }

  return trends;
}

/**
 * Get quick stats (lightweight version for frequent polling)
 */
export async function getQuickStats(companyId: string) {
  const cacheKey = `dashboard:quick:${companyId}`;

  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const [employeeCount, pendingCount] = await Promise.all([
    prisma.employee.count({ where: { companyId, isActive: true } }),
    prisma.payPeriod.count({ where: { companyId, status: 'PENDING_APPROVAL' } })
  ]);

  const stats = {
    activeEmployees: employeeCount,
    pendingApproval: pendingCount
  };

  // Cache for 1 minute
  setInCache(cacheKey, stats, 60);

  return stats;
}
