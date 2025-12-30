/**
 * Advanced Analytics Reports
 * Provides business intelligence and insights for payroll management
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

/**
 * Labor Cost Analysis Report
 * Analyzes labor costs by department, pay type, and trends
 */
export interface LaborCostAnalysis {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalLaborCost: number;      // Gross pay + employer taxes + benefits
    totalGrossPay: number;
    totalEmployerTaxes: number;
    totalBenefits: number;
    averageCostPerEmployee: number;
    laborCostAsPercentOfRevenue?: number;
  };
  byDepartment: Array<{
    department: string;
    employeeCount: number;
    totalCost: number;
    averageCostPerEmployee: number;
    percentOfTotal: number;
  }>;
  byPayType: Array<{
    payType: string;
    employeeCount: number;
    totalCost: number;
    averageCostPerEmployee: number;
  }>;
  trends: Array<{
    month: string;
    totalCost: number;
    employeeCount: number;
  }>;
}

export async function generateLaborCostAnalysis(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<LaborCostAnalysis> {
  logger.info('Generating labor cost analysis', { companyId, startDate, endDate });

  const payrolls = await prisma.payroll.findMany({
    where: {
      companyId,
      payDate: { gte: startDate, lte: endDate },
    },
    include: {
      employee: {
        select: {
          id: true,
          department: true,
          payType: true,
        },
      },
    },
  });

  // Calculate totals
  let totalGrossPay = 0;
  let totalEmployerTaxes = 0;
  let totalBenefits = 0;

  payrolls.forEach((p) => {
    totalGrossPay += Number(p.grossPay);
    totalEmployerTaxes += Number(p.totalEmployerTax);
    totalBenefits += Number(p.employer401kMatch) + Number(p.healthInsurance);
  });

  const totalLaborCost = totalGrossPay + totalEmployerTaxes + totalBenefits;
  const uniqueEmployees = new Set(payrolls.map((p) => p.employeeId));
  const employeeCount = uniqueEmployees.size;
  const averageCostPerEmployee = employeeCount > 0 ? totalLaborCost / employeeCount : 0;

  // By department
  const deptMap = new Map<string, { cost: number; employees: Set<string> }>();
  payrolls.forEach((p) => {
    const dept = p.employee.department || 'Unassigned';
    if (!deptMap.has(dept)) {
      deptMap.set(dept, { cost: 0, employees: new Set() });
    }
    const deptData = deptMap.get(dept)!;
    deptData.cost +=
      Number(p.grossPay) + Number(p.totalEmployerTax) + Number(p.employer401kMatch);
    deptData.employees.add(p.employeeId);
  });

  const byDepartment = Array.from(deptMap.entries()).map(([dept, data]) => ({
    department: dept,
    employeeCount: data.employees.size,
    totalCost: Math.round(data.cost * 100) / 100,
    averageCostPerEmployee: Math.round((data.cost / data.employees.size) * 100) / 100,
    percentOfTotal: Math.round((data.cost / totalLaborCost) * 10000) / 100,
  }));

  // By pay type
  const payTypeMap = new Map<string, { cost: number; employees: Set<string> }>();
  payrolls.forEach((p) => {
    const payType = p.employee.payType;
    if (!payTypeMap.has(payType)) {
      payTypeMap.set(payType, { cost: 0, employees: new Set() });
    }
    const payTypeData = payTypeMap.get(payType)!;
    payTypeData.cost +=
      Number(p.grossPay) + Number(p.totalEmployerTax) + Number(p.employer401kMatch);
    payTypeData.employees.add(p.employeeId);
  });

  const byPayType = Array.from(payTypeMap.entries()).map(([payType, data]) => ({
    payType,
    employeeCount: data.employees.size,
    totalCost: Math.round(data.cost * 100) / 100,
    averageCostPerEmployee: Math.round((data.cost / data.employees.size) * 100) / 100,
  }));

  // Monthly trends (last 6 months)
  const trends = await getMonthlyLaborCostTrends(companyId, 6);

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    summary: {
      totalLaborCost: Math.round(totalLaborCost * 100) / 100,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalEmployerTaxes: Math.round(totalEmployerTaxes * 100) / 100,
      totalBenefits: Math.round(totalBenefits * 100) / 100,
      averageCostPerEmployee: Math.round(averageCostPerEmployee * 100) / 100,
    },
    byDepartment,
    byPayType,
    trends,
  };
}

/**
 * Overtime Analysis Report
 * Analyzes overtime hours and costs
 */
export interface OvertimeAnalysis {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalOvertimeHours: number;
    totalOvertimePay: number;
    averageOvertimePerEmployee: number;
    overtimeAsPercentOfTotal: number;
    employeesWithOvertime: number;
  };
  byEmployee: Array<{
    employeeId: string;
    employeeName: string;
    department: string;
    totalOvertimeHours: number;
    totalOvertimePay: number;
    percentOfTotalPay: number;
  }>;
  byDepartment: Array<{
    department: string;
    totalOvertimeHours: number;
    totalOvertimePay: number;
    employeeCount: number;
  }>;
}

export async function generateOvertimeAnalysis(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<OvertimeAnalysis> {
  logger.info('Generating overtime analysis', { companyId, startDate, endDate });

  const payrolls = await prisma.payroll.findMany({
    where: {
      companyId,
      payDate: { gte: startDate, lte: endDate },
      overtimeHours: { gt: 0 },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
  });

  // Calculate summary
  const totalOvertimeHours = payrolls.reduce((sum, p) => sum + Number(p.overtimeHours), 0);
  const totalOvertimePay = payrolls.reduce((sum, p) => sum + Number(p.overtimePay), 0);
  const totalPay = payrolls.reduce((sum, p) => sum + Number(p.grossPay), 0);
  const uniqueEmployees = new Set(payrolls.map((p) => p.employeeId));
  const employeesWithOvertime = uniqueEmployees.size;
  const averageOvertimePerEmployee =
    employeesWithOvertime > 0 ? totalOvertimeHours / employeesWithOvertime : 0;
  const overtimeAsPercentOfTotal = totalPay > 0 ? (totalOvertimePay / totalPay) * 100 : 0;

  // By employee
  const employeeMap = new Map<
    string,
    { name: string; dept: string; hours: number; pay: number; totalPay: number }
  >();

  payrolls.forEach((p) => {
    const empId = p.employeeId;
    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, {
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        dept: p.employee.department || 'Unassigned',
        hours: 0,
        pay: 0,
        totalPay: 0,
      });
    }
    const empData = employeeMap.get(empId)!;
    empData.hours += Number(p.overtimeHours);
    empData.pay += Number(p.overtimePay);
    empData.totalPay += Number(p.grossPay);
  });

  const byEmployee = Array.from(employeeMap.entries()).map(([empId, data]) => ({
    employeeId: empId,
    employeeName: data.name,
    department: data.dept,
    totalOvertimeHours: Math.round(data.hours * 100) / 100,
    totalOvertimePay: Math.round(data.pay * 100) / 100,
    percentOfTotalPay: Math.round((data.pay / data.totalPay) * 10000) / 100,
  }));

  // By department
  const deptMap = new Map<string, { hours: number; pay: number; employees: Set<string> }>();
  payrolls.forEach((p) => {
    const dept = p.employee.department || 'Unassigned';
    if (!deptMap.has(dept)) {
      deptMap.set(dept, { hours: 0, pay: 0, employees: new Set() });
    }
    const deptData = deptMap.get(dept)!;
    deptData.hours += Number(p.overtimeHours);
    deptData.pay += Number(p.overtimePay);
    deptData.employees.add(p.employeeId);
  });

  const byDepartment = Array.from(deptMap.entries()).map(([dept, data]) => ({
    department: dept,
    totalOvertimeHours: Math.round(data.hours * 100) / 100,
    totalOvertimePay: Math.round(data.pay * 100) / 100,
    employeeCount: data.employees.size,
  }));

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    summary: {
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalOvertimePay: Math.round(totalOvertimePay * 100) / 100,
      averageOvertimePerEmployee: Math.round(averageOvertimePerEmployee * 100) / 100,
      overtimeAsPercentOfTotal: Math.round(overtimeAsPercentOfTotal * 100) / 100,
      employeesWithOvertime,
    },
    byEmployee,
    byDepartment,
  };
}

/**
 * 401(k) Participation Report
 */
export interface Retirement401kReport {
  summary: {
    totalEmployees: number;
    participatingEmployees: number;
    participationRate: number;
    averageContributionRate: number;
    totalEmployeeContributions: number;
    totalEmployerMatch: number;
  };
  byEmployee: Array<{
    employeeId: string;
    employeeName: string;
    isParticipating: boolean;
    contributionType: string | null;
    contributionRate: number;
    ytdContributions: number;
    ytdEmployerMatch: number;
  }>;
  contributionRanges: Array<{
    range: string;
    count: number;
    percent: number;
  }>;
}

export async function generate401kReport(companyId: string): Promise<Retirement401kReport> {
  logger.info('Generating 401k participation report', { companyId });

  // Get all active employees
  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      isActive: true,
    },
  });

  const totalEmployees = employees.length;
  const participatingEmployees = employees.filter(
    (e) => e.retirement401kType && (Number(e.retirement401kRate) > 0 || Number(e.retirement401kAmount) > 0)
  ).length;
  const participationRate = totalEmployees > 0 ? (participatingEmployees / totalEmployees) * 100 : 0;

  // Calculate YTD contributions
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const payrolls = await prisma.payroll.findMany({
    where: {
      companyId,
      payDate: { gte: yearStart },
    },
  });

  const employeeContributions = new Map<string, { contributions: number; match: number }>();
  payrolls.forEach((p) => {
    if (!employeeContributions.has(p.employeeId)) {
      employeeContributions.set(p.employeeId, { contributions: 0, match: 0 });
    }
    const data = employeeContributions.get(p.employeeId)!;
    data.contributions += Number(p.retirement401k);
    data.match += Number(p.employer401kMatch);
  });

  const totalEmployeeContributions = Array.from(employeeContributions.values()).reduce(
    (sum, data) => sum + data.contributions,
    0
  );
  const totalEmployerMatch = Array.from(employeeContributions.values()).reduce(
    (sum, data) => sum + data.match,
    0
  );

  // Calculate average contribution rate
  const contributionRates = employees
    .filter((e) => e.retirement401kType === 'PERCENT')
    .map((e) => Number(e.retirement401kRate));
  const averageContributionRate =
    contributionRates.length > 0
      ? contributionRates.reduce((sum, rate) => sum + rate, 0) / contributionRates.length
      : 0;

  // By employee
  const byEmployee = employees.map((e) => {
    const contribData = employeeContributions.get(e.id) || { contributions: 0, match: 0 };
    return {
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      isParticipating: !!e.retirement401kType,
      contributionType: e.retirement401kType,
      contributionRate: Number(e.retirement401kRate || 0),
      ytdContributions: Math.round(contribData.contributions * 100) / 100,
      ytdEmployerMatch: Math.round(contribData.match * 100) / 100,
    };
  });

  // Contribution ranges
  const ranges = [
    { min: 0, max: 0, label: 'Not Participating' },
    { min: 0.01, max: 3, label: '0-3%' },
    { min: 3.01, max: 6, label: '3-6%' },
    { min: 6.01, max: 10, label: '6-10%' },
    { min: 10.01, max: 100, label: '10%+' },
  ];

  const contributionRanges = ranges.map((range) => {
    const count = employees.filter((e) => {
      const rate = Number(e.retirement401kRate || 0);
      return rate >= range.min && rate <= range.max;
    }).length;
    return {
      range: range.label,
      count,
      percent: totalEmployees > 0 ? Math.round((count / totalEmployees) * 10000) / 100 : 0,
    };
  });

  return {
    summary: {
      totalEmployees,
      participatingEmployees,
      participationRate: Math.round(participationRate * 100) / 100,
      averageContributionRate: Math.round(averageContributionRate * 100) / 100,
      totalEmployeeContributions: Math.round(totalEmployeeContributions * 100) / 100,
      totalEmployerMatch: Math.round(totalEmployerMatch * 100) / 100,
    },
    byEmployee,
    contributionRanges,
  };
}

/**
 * Helper: Get monthly labor cost trends
 */
async function getMonthlyLaborCostTrends(companyId: string, months: number) {
  const trends = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    const monthPayrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        payDate: { gte: monthStart, lte: monthEnd },
      },
    });

    const totalCost = monthPayrolls.reduce(
      (sum, p) =>
        sum +
        Number(p.grossPay) +
        Number(p.totalEmployerTax) +
        Number(p.employer401kMatch),
      0
    );

    const uniqueEmployees = new Set(monthPayrolls.map((p) => p.employeeId));

    trends.push({
      month: monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
      totalCost: Math.round(totalCost * 100) / 100,
      employeeCount: uniqueEmployees.size,
    });
  }

  return trends;
}
