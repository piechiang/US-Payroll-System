/**
 * Report Generator Service
 * Generates various payroll and tax reports
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

export interface ReportFilters {
  companyId: string;
  startDate?: Date;
  endDate?: Date;
  employeeIds?: string[];
  department?: string;
}

export interface PayrollSummaryReport {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEmployees: number;
    totalGrossPay: number;
    totalNetPay: number;
    totalTaxes: number;
    totalDeductions: number;
    totalEmployerTax: number;
  };
  breakdown: {
    byDepartment: Array<{
      department: string;
      employeeCount: number;
      totalGrossPay: number;
      totalNetPay: number;
    }>;
    byPayType: Array<{
      payType: string;
      employeeCount: number;
      totalGrossPay: number;
    }>;
  };
  payrolls: Array<{
    employeeId: string;
    employeeName: string;
    department: string;
    payDate: string;
    grossPay: number;
    netPay: number;
    taxes: number;
    deductions: number;
  }>;
}

export interface TaxSummaryReport {
  period: {
    startDate: string;
    endDate: string;
  };
  federal: {
    federalWithholding: number;
    socialSecurity: number;
    medicare: number;
    futa: number;
    total: number;
  };
  state: {
    stateWithholding: number;
    sui: number;
    sdi: number;
    total: number;
  };
  local: {
    localWithholding: number;
  };
  totals: {
    employeeTaxes: number;
    employerTaxes: number;
    grandTotal: number;
  };
}

export interface EmployeeEarningsReport {
  period: {
    startDate: string;
    endDate: string;
  };
  employees: Array<{
    id: string;
    name: string;
    ssn: string; // Masked: XXX-XX-1234
    department: string;
    payType: string;
    regularPay: number;
    overtimePay: number;
    bonus: number;
    commission: number;
    tips: number;
    grossPay: number;
    federalTax: number;
    stateTax: number;
    fica: number;
    otherDeductions: number;
    netPay: number;
    ytdGrossPay: number;
    ytdNetPay: number;
  }>;
  summary: {
    totalGrossPay: number;
    totalNetPay: number;
    totalTaxes: number;
    totalDeductions: number;
  };
}

/**
 * Generate Payroll Summary Report
 */
export async function generatePayrollSummaryReport(
  filters: ReportFilters
): Promise<PayrollSummaryReport> {
  const { companyId, startDate, endDate, employeeIds, department } = filters;

  logger.info('Generating payroll summary report', { companyId, startDate, endDate });

  // Build where clause
  const where: any = {
    companyId,
  };

  if (startDate || endDate) {
    where.payDate = {};
    if (startDate) where.payDate.gte = startDate;
    if (endDate) where.payDate.lte = endDate;
  }

  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds };
  }

  // Fetch payrolls with employee data
  const payrolls = await prisma.payroll.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          payType: true,
        },
      },
    },
    orderBy: { payDate: 'desc' },
  });

  // Filter by department if specified
  const filteredPayrolls = department
    ? payrolls.filter((p) => p.employee.department === department)
    : payrolls;

  // Calculate summary totals
  const summary = {
    totalEmployees: new Set(filteredPayrolls.map((p) => p.employeeId)).size,
    totalGrossPay: filteredPayrolls.reduce((sum, p) => sum + Number(p.grossPay), 0),
    totalNetPay: filteredPayrolls.reduce((sum, p) => sum + Number(p.netPay), 0),
    totalTaxes: filteredPayrolls.reduce(
      (sum, p) =>
        sum +
        Number(p.federalWithholding) +
        Number(p.socialSecurity) +
        Number(p.medicare) +
        Number(p.stateWithholding) +
        Number(p.localWithholding),
      0
    ),
    totalDeductions: filteredPayrolls.reduce((sum, p) => sum + Number(p.totalDeductions), 0),
    totalEmployerTax: filteredPayrolls.reduce((sum, p) => sum + Number(p.totalEmployerTax), 0),
  };

  // Group by department
  const byDepartment = new Map<
    string,
    { employeeCount: Set<string>; totalGrossPay: number; totalNetPay: number }
  >();

  filteredPayrolls.forEach((p) => {
    const dept = p.employee.department || 'Unassigned';
    if (!byDepartment.has(dept)) {
      byDepartment.set(dept, {
        employeeCount: new Set(),
        totalGrossPay: 0,
        totalNetPay: 0,
      });
    }
    const deptData = byDepartment.get(dept)!;
    deptData.employeeCount.add(p.employeeId);
    deptData.totalGrossPay += Number(p.grossPay);
    deptData.totalNetPay += Number(p.netPay);
  });

  // Group by pay type
  const byPayType = new Map<string, { employeeCount: Set<string>; totalGrossPay: number }>();

  filteredPayrolls.forEach((p) => {
    const payType = p.employee.payType;
    if (!byPayType.has(payType)) {
      byPayType.set(payType, {
        employeeCount: new Set(),
        totalGrossPay: 0,
      });
    }
    const payTypeData = byPayType.get(payType)!;
    payTypeData.employeeCount.add(p.employeeId);
    payTypeData.totalGrossPay += Number(p.grossPay);
  });

  // Format payroll details
  const payrollDetails = filteredPayrolls.map((p) => ({
    employeeId: p.employeeId,
    employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
    department: p.employee.department || 'Unassigned',
    payDate: p.payDate.toISOString(),
    grossPay: Math.round(Number(p.grossPay) * 100) / 100,
    netPay: Math.round(Number(p.netPay) * 100) / 100,
    taxes:
      Math.round(
        (Number(p.federalWithholding) +
          Number(p.socialSecurity) +
          Number(p.medicare) +
          Number(p.stateWithholding) +
          Number(p.localWithholding)) *
          100
      ) / 100,
    deductions: Math.round(Number(p.totalDeductions) * 100) / 100,
  }));

  return {
    period: {
      startDate: startDate?.toISOString() || 'Beginning',
      endDate: endDate?.toISOString() || 'Now',
    },
    summary: {
      ...summary,
      totalGrossPay: Math.round(summary.totalGrossPay * 100) / 100,
      totalNetPay: Math.round(summary.totalNetPay * 100) / 100,
      totalTaxes: Math.round(summary.totalTaxes * 100) / 100,
      totalDeductions: Math.round(summary.totalDeductions * 100) / 100,
      totalEmployerTax: Math.round(summary.totalEmployerTax * 100) / 100,
    },
    breakdown: {
      byDepartment: Array.from(byDepartment.entries()).map(([dept, data]) => ({
        department: dept,
        employeeCount: data.employeeCount.size,
        totalGrossPay: Math.round(data.totalGrossPay * 100) / 100,
        totalNetPay: Math.round(data.totalNetPay * 100) / 100,
      })),
      byPayType: Array.from(byPayType.entries()).map(([payType, data]) => ({
        payType,
        employeeCount: data.employeeCount.size,
        totalGrossPay: Math.round(data.totalGrossPay * 100) / 100,
      })),
    },
    payrolls: payrollDetails,
  };
}

/**
 * Generate Tax Summary Report
 */
export async function generateTaxSummaryReport(
  filters: ReportFilters
): Promise<TaxSummaryReport> {
  const { companyId, startDate, endDate } = filters;

  logger.info('Generating tax summary report', { companyId, startDate, endDate });

  const where: any = {
    companyId,
  };

  if (startDate || endDate) {
    where.payDate = {};
    if (startDate) where.payDate.gte = startDate;
    if (endDate) where.payDate.lte = endDate;
  }

  const aggregates = await prisma.payroll.aggregate({
    where,
    _sum: {
      federalWithholding: true,
      socialSecurity: true,
      medicare: true,
      stateWithholding: true,
      stateDisability: true,
      stateUnemployment: true,
      localWithholding: true,
      employerFuta: true,
      employerSuta: true,
      employerSocialSecurity: true,
      employerMedicare: true,
      totalEmployerTax: true,
    },
  });

  const sums = aggregates._sum;

  const federalWithholding = Number(sums.federalWithholding || 0);
  const socialSecurity = Number(sums.socialSecurity || 0);
  const medicare = Number(sums.medicare || 0);
  const futa = Number(sums.employerFuta || 0);

  const stateWithholding = Number(sums.stateWithholding || 0);
  const sui = Number(sums.employerSuta || 0);
  const sdi = Number(sums.stateDisability || 0);

  const localWithholding = Number(sums.localWithholding || 0);

  const employerTaxes = Number(sums.totalEmployerTax || 0);
  const employeeTaxes =
    federalWithholding + socialSecurity + medicare + stateWithholding + sdi + localWithholding;

  return {
    period: {
      startDate: startDate?.toISOString() || 'Beginning',
      endDate: endDate?.toISOString() || 'Now',
    },
    federal: {
      federalWithholding: Math.round(federalWithholding * 100) / 100,
      socialSecurity: Math.round(socialSecurity * 100) / 100,
      medicare: Math.round(medicare * 100) / 100,
      futa: Math.round(futa * 100) / 100,
      total: Math.round((federalWithholding + socialSecurity + medicare + futa) * 100) / 100,
    },
    state: {
      stateWithholding: Math.round(stateWithholding * 100) / 100,
      sui: Math.round(sui * 100) / 100,
      sdi: Math.round(sdi * 100) / 100,
      total: Math.round((stateWithholding + sui + sdi) * 100) / 100,
    },
    local: {
      localWithholding: Math.round(localWithholding * 100) / 100,
    },
    totals: {
      employeeTaxes: Math.round(employeeTaxes * 100) / 100,
      employerTaxes: Math.round(employerTaxes * 100) / 100,
      grandTotal: Math.round((employeeTaxes + employerTaxes) * 100) / 100,
    },
  };
}

/**
 * Generate Employee Earnings Report
 */
export async function generateEmployeeEarningsReport(
  filters: ReportFilters
): Promise<EmployeeEarningsReport> {
  const { companyId, startDate, endDate, employeeIds } = filters;

  logger.info('Generating employee earnings report', { companyId, startDate, endDate });

  const where: any = {
    companyId,
  };

  if (startDate || endDate) {
    where.payDate = {};
    if (startDate) where.payDate.gte = startDate;
    if (endDate) where.payDate.lte = endDate;
  }

  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds };
  }

  const payrolls = await prisma.payroll.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          ssn: true,
          department: true,
          payType: true,
        },
      },
    },
    orderBy: { payDate: 'desc' },
  });

  // Group by employee
  const employeeMap = new Map<string, any>();

  payrolls.forEach((p) => {
    if (!employeeMap.has(p.employeeId)) {
      // Mask SSN: show only last 4 digits
      const ssnFull = p.employee.ssn;
      const maskedSSN = `XXX-XX-${ssnFull.slice(-4)}`;

      employeeMap.set(p.employeeId, {
        id: p.employeeId,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        ssn: maskedSSN,
        department: p.employee.department || 'Unassigned',
        payType: p.employee.payType,
        regularPay: 0,
        overtimePay: 0,
        bonus: 0,
        commission: 0,
        tips: 0,
        grossPay: 0,
        federalTax: 0,
        stateTax: 0,
        fica: 0,
        otherDeductions: 0,
        netPay: 0,
        ytdGrossPay: Number(p.ytdGrossPay || 0),
        ytdNetPay: Number(p.ytdNetPay || 0),
      });
    }

    const emp = employeeMap.get(p.employeeId);
    emp.regularPay += Number(p.regularPay);
    emp.overtimePay += Number(p.overtimePay);
    emp.bonus += Number(p.bonus);
    emp.commission += Number(p.commission);
    emp.tips += Number(p.creditCardTips) + Number(p.cashTips);
    emp.grossPay += Number(p.grossPay);
    emp.federalTax += Number(p.federalWithholding);
    emp.stateTax += Number(p.stateWithholding);
    emp.fica += Number(p.socialSecurity) + Number(p.medicare);
    emp.otherDeductions += Number(p.totalDeductions);
    emp.netPay += Number(p.netPay);
  });

  const employees = Array.from(employeeMap.values()).map((emp) => ({
    ...emp,
    regularPay: Math.round(emp.regularPay * 100) / 100,
    overtimePay: Math.round(emp.overtimePay * 100) / 100,
    bonus: Math.round(emp.bonus * 100) / 100,
    commission: Math.round(emp.commission * 100) / 100,
    tips: Math.round(emp.tips * 100) / 100,
    grossPay: Math.round(emp.grossPay * 100) / 100,
    federalTax: Math.round(emp.federalTax * 100) / 100,
    stateTax: Math.round(emp.stateTax * 100) / 100,
    fica: Math.round(emp.fica * 100) / 100,
    otherDeductions: Math.round(emp.otherDeductions * 100) / 100,
    netPay: Math.round(emp.netPay * 100) / 100,
    ytdGrossPay: Math.round(emp.ytdGrossPay * 100) / 100,
    ytdNetPay: Math.round(emp.ytdNetPay * 100) / 100,
  }));

  const summary = {
    totalGrossPay: employees.reduce((sum, e) => sum + e.grossPay, 0),
    totalNetPay: employees.reduce((sum, e) => sum + e.netPay, 0),
    totalTaxes: employees.reduce((sum, e) => sum + e.federalTax + e.stateTax + e.fica, 0),
    totalDeductions: employees.reduce((sum, e) => sum + e.otherDeductions, 0),
  };

  return {
    period: {
      startDate: startDate?.toISOString() || 'Beginning',
      endDate: endDate?.toISOString() || 'Now',
    },
    employees,
    summary: {
      totalGrossPay: Math.round(summary.totalGrossPay * 100) / 100,
      totalNetPay: Math.round(summary.totalNetPay * 100) / 100,
      totalTaxes: Math.round(summary.totalTaxes * 100) / 100,
      totalDeductions: Math.round(summary.totalDeductions * 100) / 100,
    },
  };
}
