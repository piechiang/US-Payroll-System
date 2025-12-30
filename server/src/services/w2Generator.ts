/**
 * W-2 Form Generator Service
 *
 * Generates W-2 forms by aggregating annual payroll data for each employee.
 * Follows IRS Form W-2 specifications for tax year reporting.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

// Social Security wage base limits by year
const SS_WAGE_BASE: Record<number, number> = {
  2023: 160200,
  2024: 168600,
  2025: 176100  // Projected
};

// Box 12 codes for common deductions
export const BOX_12_CODES = {
  D: '401(k) elective deferrals',
  E: '403(b) elective deferrals',
  F: '408(k)(6) SEP contributions',
  G: '457(b) deferrals',
  H: '501(c)(18)(D) contributions',
  W: 'Health Savings Account (HSA)',
  AA: 'Roth 401(k) contributions',
  BB: 'Roth 403(b) contributions',
  DD: 'Cost of employer-sponsored health coverage',
  EE: 'SIMPLE retirement account contributions'
};

export interface W2Data {
  employeeId: string;
  employeeName: string;
  employeeSSN: string;  // Will be masked in response, full SSN only in PDF
  employeeAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  companyId: string;
  companyName: string;
  companyEIN: string;
  companyAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  taxYear: number;

  // W-2 Box values
  box1WagesTipsOther: number;
  box2FederalWithholding: number;
  box3SocialSecurityWages: number;
  box4SocialSecurityTax: number;
  box5MedicareWages: number;
  box6MedicareTax: number;
  box7SocialSecurityTips: number;
  box8AllocatedTips: number;
  box10DependentCareBenefits: number;
  box11NonqualifiedPlans: number;
  box12: Array<{ code: string; amount: number }>;
  box13: {
    statutoryEmployee: boolean;
    retirementPlan: boolean;
    thirdPartySickPay: boolean;
  };
  box14Other: Array<{ description: string; amount: number }>;

  // State info (Box 15-17)
  stateCode: string | null;
  stateEmployerId: string | null;
  stateWages: number;
  stateWithholding: number;

  // Local info (Box 18-20)
  localWages: number;
  localWithholding: number;
  localityName: string | null;

  // Second state (if applicable)
  state2Code: string | null;
  state2EmployerId: string | null;
  state2Wages: number;
  state2Withholding: number;

  // Control number
  controlNumber: string;
}

/**
 * Generate W-2 data for a single employee for a given tax year
 */
export async function generateW2ForEmployee(
  employeeId: string,
  taxYear: number
): Promise<W2Data> {
  // Get employee with company info
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { company: true }
  });

  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`);
  }

  // Get all payrolls for this employee in the tax year
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59);

  const payrolls = await prisma.payroll.findMany({
    where: {
      employeeId,
      payDate: {
        gte: yearStart,
        lte: yearEnd
      },
      status: { not: 'VOID' }
    }
  });

  if (payrolls.length === 0) {
    throw new Error(`No payroll records found for employee ${employeeId} in ${taxYear}`);
  }

  // Aggregate payroll data
  const aggregated = aggregatePayrollData(payrolls, taxYear);

  // Build Box 12 codes
  const box12: Array<{ code: string; amount: number }> = [];
  if (aggregated.retirement401k > 0) {
    box12.push({ code: 'D', amount: aggregated.retirement401k });
  }
  if (aggregated.hsaContribution > 0) {
    box12.push({ code: 'W', amount: aggregated.hsaContribution });
  }

  // Build Box 14 (other)
  const box14Other: Array<{ description: string; amount: number }> = [];
  if (aggregated.stateDisability > 0) {
    box14Other.push({ description: 'SDI', amount: aggregated.stateDisability });
  }

  // Generate control number (unique identifier)
  const controlNumber = generateControlNumber(employee.companyId, employeeId, taxYear);

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeSSN: employee.ssn, // Encrypted, will be decrypted for PDF
    employeeAddress: {
      street: employee.address,
      city: employee.city,
      state: employee.state,
      zipCode: employee.zipCode
    },
    companyId: employee.company.id,
    companyName: employee.company.name,
    companyEIN: employee.company.ein,
    companyAddress: {
      street: employee.company.address,
      city: employee.company.city,
      state: employee.company.state,
      zipCode: employee.company.zipCode
    },
    taxYear,

    // Box values
    box1WagesTipsOther: aggregated.wagesTipsOther,
    box2FederalWithholding: aggregated.federalWithholding,
    box3SocialSecurityWages: aggregated.socialSecurityWages,
    box4SocialSecurityTax: aggregated.socialSecurityTax,
    box5MedicareWages: aggregated.medicareWages,
    box6MedicareTax: aggregated.medicareTax,
    box7SocialSecurityTips: aggregated.socialSecurityTips,
    box8AllocatedTips: 0, // Not tracked in our system
    box10DependentCareBenefits: 0, // Not tracked
    box11NonqualifiedPlans: 0, // Not tracked
    box12,
    box13: {
      statutoryEmployee: false,
      retirementPlan: aggregated.retirement401k > 0,
      thirdPartySickPay: false
    },
    box14Other,

    // State info
    stateCode: employee.state,
    stateEmployerId: employee.company.stateWithholdingId,
    stateWages: aggregated.stateWages,
    stateWithholding: aggregated.stateWithholding,

    // Local info
    localWages: aggregated.localWages,
    localWithholding: aggregated.localWithholding,
    localityName: employee.workCity || employee.city,

    // Second state (work state if different)
    state2Code: employee.workState && employee.workState !== employee.state ? employee.workState : null,
    state2EmployerId: null,
    state2Wages: 0, // Would need to track wages by work location
    state2Withholding: 0,

    controlNumber
  };
}

/**
 * Generate W-2s for all employees of a company for a given tax year
 */
export async function generateW2sForCompany(
  companyId: string,
  taxYear: number
): Promise<W2Data[]> {
  // Get all active employees (and those terminated during the year)
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31);

  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      OR: [
        { isActive: true },
        {
          terminationDate: {
            gte: yearStart,
            lte: yearEnd
          }
        },
        {
          // Employees who were active at any point during the year
          hireDate: { lte: yearEnd }
        }
      ]
    }
  });

  // Check which employees have payroll records for the year
  const employeesWithPayroll = await prisma.payroll.groupBy({
    by: ['employeeId'],
    where: {
      companyId,
      payDate: {
        gte: yearStart,
        lte: yearEnd
      },
      status: { not: 'VOID' }
    }
  });

  const employeeIdsWithPayroll = new Set(employeesWithPayroll.map(e => e.employeeId));

  // Generate W-2 for each employee with payroll
  const w2s: W2Data[] = [];
  for (const employee of employees) {
    if (employeeIdsWithPayroll.has(employee.id)) {
      try {
        const w2 = await generateW2ForEmployee(employee.id, taxYear);
        w2s.push(w2);
      } catch (error) {
        logger.error(`Failed to generate W-2 for employee ${employee.id}:`, error);
      }
    }
  }

  return w2s;
}

/**
 * Save W-2 data to database
 */
export async function saveW2ToDatabase(w2Data: W2Data): Promise<string> {
  const existing = await prisma.w2Form.findUnique({
    where: {
      employeeId_taxYear: {
        employeeId: w2Data.employeeId,
        taxYear: w2Data.taxYear
      }
    }
  });

  const data = {
    employeeId: w2Data.employeeId,
    companyId: w2Data.companyId,
    taxYear: w2Data.taxYear,
    wagesTipsOther: w2Data.box1WagesTipsOther,
    federalWithholding: w2Data.box2FederalWithholding,
    socialSecurityWages: w2Data.box3SocialSecurityWages,
    socialSecurityTax: w2Data.box4SocialSecurityTax,
    medicareWages: w2Data.box5MedicareWages,
    medicareTax: w2Data.box6MedicareTax,
    socialSecurityTips: w2Data.box7SocialSecurityTips,
    allocatedTips: w2Data.box8AllocatedTips,
    dependentCareBenefits: w2Data.box10DependentCareBenefits,
    nonqualifiedPlans: w2Data.box11NonqualifiedPlans,
    box12Codes: JSON.stringify(w2Data.box12),
    statutoryEmployee: w2Data.box13.statutoryEmployee,
    retirementPlan: w2Data.box13.retirementPlan,
    thirdPartySickPay: w2Data.box13.thirdPartySickPay,
    box14Other: JSON.stringify(w2Data.box14Other),
    stateCode: w2Data.stateCode,
    stateEmployerId: w2Data.stateEmployerId,
    stateWages: w2Data.stateWages,
    stateWithholding: w2Data.stateWithholding,
    localWages: w2Data.localWages,
    localWithholding: w2Data.localWithholding,
    localityName: w2Data.localityName,
    state2Code: w2Data.state2Code,
    state2EmployerId: w2Data.state2EmployerId,
    state2Wages: w2Data.state2Wages,
    state2Withholding: w2Data.state2Withholding,
    controlNumber: w2Data.controlNumber,
    status: 'GENERATED',
    generatedAt: new Date()
  };

  if (existing) {
    await prisma.w2Form.update({
      where: { id: existing.id },
      data
    });
    return existing.id;
  } else {
    const created = await prisma.w2Form.create({ data });
    return created.id;
  }
}

/**
 * Aggregate payroll data for W-2 generation
 */
function aggregatePayrollData(payrolls: any[], taxYear: number): {
  wagesTipsOther: number;
  federalWithholding: number;
  socialSecurityWages: number;
  socialSecurityTax: number;
  medicareWages: number;
  medicareTax: number;
  socialSecurityTips: number;
  stateWages: number;
  stateWithholding: number;
  stateDisability: number;
  localWages: number;
  localWithholding: number;
  retirement401k: number;
  hsaContribution: number;
} {
  const ssWageBase = SS_WAGE_BASE[taxYear] || SS_WAGE_BASE[2024];

  let totalGross = 0;
  let totalTips = 0;
  let federalWithholding = 0;
  let socialSecurityTax = 0;
  let medicareTax = 0;
  let stateWithholding = 0;
  let stateDisability = 0;
  let localWithholding = 0;
  let retirement401k = 0;
  let hsaContribution = 0;

  for (const payroll of payrolls) {
    const gross = Number(payroll.grossPay);
    const tips = Number(payroll.creditCardTips || 0) + Number(payroll.cashTips || 0);

    totalGross += gross;
    totalTips += tips;
    federalWithholding += Number(payroll.federalWithholding);
    socialSecurityTax += Number(payroll.socialSecurity);
    medicareTax += Number(payroll.medicare);
    stateWithholding += Number(payroll.stateWithholding || 0);
    stateDisability += Number(payroll.stateDisability || 0);
    localWithholding += Number(payroll.localWithholding || 0);
    retirement401k += Number(payroll.retirement401k || 0);
    hsaContribution += Number(payroll.hsaContribution || 0);
  }

  // Box 1: Wages, tips, other compensation
  // = Gross wages - pre-tax deductions (401k, HSA, health insurance)
  const wagesTipsOther = round(totalGross - retirement401k - hsaContribution);

  // Box 3: Social Security wages (capped at wage base)
  const socialSecurityWages = round(Math.min(totalGross, ssWageBase));

  // Box 5: Medicare wages (no cap)
  const medicareWages = round(totalGross);

  return {
    wagesTipsOther,
    federalWithholding: round(federalWithholding),
    socialSecurityWages,
    socialSecurityTax: round(socialSecurityTax),
    medicareWages,
    medicareTax: round(medicareTax),
    socialSecurityTips: round(totalTips),
    stateWages: round(totalGross),
    stateWithholding: round(stateWithholding),
    stateDisability: round(stateDisability),
    localWages: round(totalGross),
    localWithholding: round(localWithholding),
    retirement401k: round(retirement401k),
    hsaContribution: round(hsaContribution)
  };
}

/**
 * Generate a unique control number for W-2
 */
function generateControlNumber(companyId: string, employeeId: string, taxYear: number): string {
  // Format: YYYY-CCCC-EEEE where C is company suffix and E is employee suffix
  const companyPart = companyId.slice(-4).toUpperCase();
  const employeePart = employeeId.slice(-4).toUpperCase();
  return `${taxYear}-${companyPart}-${employeePart}`;
}

/**
 * Round to 2 decimal places
 */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Get W-2 summary statistics for a company
 */
export async function getW2Summary(companyId: string, taxYear: number): Promise<{
  totalEmployees: number;
  totalWages: number;
  totalFederalWithholding: number;
  totalSocialSecurityTax: number;
  totalMedicareTax: number;
  totalStateWithholding: number;
  generated: number;
  pending: number;
}> {
  const w2s = await prisma.w2Form.findMany({
    where: { companyId, taxYear }
  });

  const totals = w2s.reduce((acc, w2) => ({
    wages: acc.wages + Number(w2.wagesTipsOther),
    federal: acc.federal + Number(w2.federalWithholding),
    ss: acc.ss + Number(w2.socialSecurityTax),
    medicare: acc.medicare + Number(w2.medicareTax),
    state: acc.state + Number(w2.stateWithholding)
  }), { wages: 0, federal: 0, ss: 0, medicare: 0, state: 0 });

  const generated = w2s.filter(w => w.status === 'GENERATED' || w.status === 'SENT').length;

  // Count employees with payroll but no W-2 yet
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31);

  const employeesWithPayroll = await prisma.payroll.groupBy({
    by: ['employeeId'],
    where: {
      companyId,
      payDate: { gte: yearStart, lte: yearEnd },
      status: { not: 'VOID' }
    }
  });

  return {
    totalEmployees: employeesWithPayroll.length,
    totalWages: round(totals.wages),
    totalFederalWithholding: round(totals.federal),
    totalSocialSecurityTax: round(totals.ss),
    totalMedicareTax: round(totals.medicare),
    totalStateWithholding: round(totals.state),
    generated,
    pending: employeesWithPayroll.length - generated
  };
}
