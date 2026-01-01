/**
 * W-2 Form Generator Service
 *
 * Generates W-2 forms by aggregating annual payroll data for each employee.
 * Follows IRS Form W-2 specifications for tax year reporting.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import PDFDocument from 'pdfkit';
import { decrypt } from './encryption.js';

// PDFKit types
type PDFDoc = typeof PDFDocument extends new (...args: any[]) => infer R ? R : any;

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

/**
 * Generate W-2 PDF (2-Up format: Copy B and Copy C on one page)
 *
 * Copy B: To Be Filed With Employee's FEDERAL Tax Return
 * Copy C: For EMPLOYEE'S RECORDS
 *
 * Note: This generates substitute forms (black text). For Copy A (SSA filing),
 * use official red-ink forms from the IRS.
 */
export function generateW2PDF(data: W2Data): PDFDoc {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    bufferPages: true
  });

  // Decrypt SSN for display
  const ssn = decrypt(data.employeeSSN);
  const formattedSSN = ssn.replace(/(\d{3})(\d{2})(\d{4})/, '$1-$2-$3');

  // Draw Copy B (top half)
  drawW2Form(doc, data, formattedSSN, 0, 'Copy B', 'To Be Filed With Employee\'s FEDERAL Tax Return');

  // Draw cut line
  doc.moveTo(0, 396).lineTo(612, 396).dash(5, { space: 5 }).stroke().undash();

  // Draw Copy C (bottom half)
  drawW2Form(doc, data, formattedSSN, 396, 'Copy C', 'For EMPLOYEE\'S RECORDS');

  doc.end();
  return doc;
}

/**
 * Draw a single W-2 form on the PDF
 */
function drawW2Form(
  doc: PDFDoc,
  data: W2Data,
  ssn: string,
  yOffset: number,
  copyName: string,
  copyDescription: string
) {
  const startX = 36;
  const startY = 36 + yOffset;
  const boxHeight = 22;
  const fontSize = 9;
  const labelSize = 7;

  // Header: "Copy B" and description
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text(copyName, startX, startY - 20);
  doc.fontSize(7).font('Helvetica');
  doc.text(copyDescription, startX + 50, startY - 19);

  // Title
  doc.fontSize(14).font('Helvetica-Bold');
  doc.text(`${data.taxYear} Wage and Tax Statement`, startX + 150, startY - 20);
  doc.fontSize(labelSize).font('Helvetica');
  doc.text('Form W-2', startX + 450, startY - 20);

  // Reset font
  doc.fontSize(fontSize).font('Helvetica');

  // Row 1: a-f (SSN, EIN, employer info, employee info)
  drawBox(doc, startX, startY, 130, 35, 'a  Employee\'s social security number');
  doc.fontSize(fontSize).font('Helvetica-Bold').text(ssn, startX + 10, startY + 18);
  doc.font('Helvetica');

  drawBox(doc, startX + 130, startY, 130, 35, 'b  Employer identification number (EIN)');
  doc.fontSize(fontSize).text(data.companyEIN, startX + 140, startY + 18);

  drawBox(doc, startX + 260, startY, 280, 35, 'c  Employer\'s name, address, and ZIP code');
  doc.fontSize(fontSize).text(data.companyName, startX + 270, startY + 12);
  doc.fontSize(7).text(
    `${data.companyAddress.street}\n${data.companyAddress.city}, ${data.companyAddress.state} ${data.companyAddress.zipCode}`,
    startX + 270,
    startY + 20
  );
  doc.fontSize(fontSize);

  // Row 2: d-f (control number, employee info)
  const row2Y = startY + 35;
  drawBox(doc, startX, row2Y, 130, 50, 'd  Control number');
  doc.fontSize(7).text(data.controlNumber, startX + 10, row2Y + 18);
  doc.fontSize(fontSize);

  drawBox(doc, startX + 130, row2Y, 410, 50, 'e  Employee\'s first name and initial             Last name                                          Suff.');
  doc.fontSize(fontSize).text(data.employeeName, startX + 140, row2Y + 18);

  const row3Y = row2Y + 25;
  doc.fontSize(7).text(`${data.employeeAddress.street}`, startX + 140, row3Y + 6);
  doc.fontSize(labelSize).text('f  Employee\'s address and ZIP code', startX + 140, row3Y + 12);
  doc.fontSize(7).text(
    `${data.employeeAddress.city}, ${data.employeeAddress.state} ${data.employeeAddress.zipCode}`,
    startX + 140,
    row3Y + 18
  );
  doc.fontSize(fontSize);

  // Row 3: Boxes 1-6 (wages and taxes)
  const row4Y = row2Y + 50;
  const col1Width = 90;
  const col2Width = 90;
  const col3Width = 90;
  const col4Width = 90;
  const col5Width = 90;
  const col6Width = 90;

  drawValueBox(doc, startX, row4Y, col1Width, boxHeight, '1  Wages, tips, other compensation', formatMoney(data.box1WagesTipsOther));
  drawValueBox(doc, startX + col1Width, row4Y, col2Width, boxHeight, '2  Federal income tax withheld', formatMoney(data.box2FederalWithholding));
  drawValueBox(doc, startX + col1Width + col2Width, row4Y, col3Width, boxHeight, '3  Social security wages', formatMoney(data.box3SocialSecurityWages));
  drawValueBox(doc, startX + col1Width + col2Width + col3Width, row4Y, col4Width, boxHeight, '4  Social security tax withheld', formatMoney(data.box4SocialSecurityTax));
  drawValueBox(doc, startX + col1Width + col2Width + col3Width + col4Width, row4Y, col5Width, boxHeight, '5  Medicare wages and tips', formatMoney(data.box5MedicareWages));
  drawValueBox(doc, startX + col1Width + col2Width + col3Width + col4Width + col5Width, row4Y, col6Width, boxHeight, '6  Medicare tax withheld', formatMoney(data.box6MedicareTax));

  // Row 4: Boxes 7-8
  const row5Y = row4Y + boxHeight;
  drawValueBox(doc, startX, row5Y, col1Width, boxHeight, '7  Social security tips', formatMoney(data.box7SocialSecurityTips));
  drawValueBox(doc, startX + col1Width, row5Y, col2Width, boxHeight, '8  Allocated tips', formatMoney(data.box8AllocatedTips));
  drawValueBox(doc, startX + col1Width + col2Width, row5Y, col3Width, boxHeight, '9  ', '');
  drawValueBox(doc, startX + col1Width + col2Width + col3Width, row5Y, col4Width, boxHeight, '10  Dependent care benefits', formatMoney(data.box10DependentCareBenefits));
  drawValueBox(doc, startX + col1Width + col2Width + col3Width + col4Width, row5Y, col5Width, boxHeight, '11  Nonqualified plans', formatMoney(data.box11NonqualifiedPlans));

  // Box 12a-12d (codes and amounts)
  const row6Y = row5Y + boxHeight;
  drawBox(doc, startX + col1Width + col2Width + col3Width + col4Width + col5Width, row6Y, col6Width, boxHeight, '12a  See instructions for box 12');

  const box12Code1 = data.box12[0] || null;
  const box12Code2 = data.box12[1] || null;
  const box12Code3 = data.box12[2] || null;
  const box12Code4 = data.box12[3] || null;

  if (box12Code1) {
    doc.fontSize(6).text(box12Code1.code, startX + 450, row6Y + 8);
    doc.fontSize(7).text(formatMoney(box12Code1.amount), startX + 465, row6Y + 8);
  }

  const row7Y = row6Y + boxHeight / 2;
  if (box12Code2) {
    doc.fontSize(6).text(box12Code2.code, startX + 450, row7Y + 8);
    doc.fontSize(7).text(formatMoney(box12Code2.amount), startX + 465, row7Y + 8);
  }

  // Box 13 (checkboxes)
  const row8Y = row6Y + boxHeight;
  drawBox(doc, startX, row8Y, col1Width + col2Width + col3Width + col4Width + col5Width, boxHeight, '13  ');
  doc.fontSize(7);
  drawCheckbox(doc, startX + 10, row8Y + 8, data.box13.statutoryEmployee);
  doc.text('Statutory employee', startX + 20, row8Y + 7);
  drawCheckbox(doc, startX + 100, row8Y + 8, data.box13.retirementPlan);
  doc.text('Retirement plan', startX + 110, row8Y + 7);
  drawCheckbox(doc, startX + 180, row8Y + 8, data.box13.thirdPartySickPay);
  doc.text('Third-party sick pay', startX + 190, row8Y + 7);

  // Box 12c-12d
  drawBox(doc, startX + col1Width + col2Width + col3Width + col4Width + col5Width, row8Y, col6Width, boxHeight / 2, '12b');
  if (box12Code3) {
    doc.fontSize(6).text(box12Code3.code, startX + 450, row8Y + 8);
    doc.fontSize(7).text(formatMoney(box12Code3.amount), startX + 465, row8Y + 8);
  }

  const row9Y = row8Y + boxHeight / 2;
  drawBox(doc, startX + col1Width + col2Width + col3Width + col4Width + col5Width, row9Y, col6Width, boxHeight / 2, '12c');
  if (box12Code4) {
    doc.fontSize(6).text(box12Code4.code, startX + 450, row9Y + 8);
    doc.fontSize(7).text(formatMoney(box12Code4.amount), startX + 465, row9Y + 8);
  }

  // Box 14 (other)
  const row10Y = row8Y + boxHeight;
  drawBox(doc, startX, row10Y, col1Width + col2Width + col3Width + col4Width + col5Width, boxHeight, '14  Other');
  if (data.box14Other.length > 0) {
    const box14Text = data.box14Other.map(item => `${item.description} ${formatMoney(item.amount)}`).join(', ');
    doc.fontSize(7).text(box14Text, startX + 10, row10Y + 8, { width: 430 });
  }

  drawBox(doc, startX + col1Width + col2Width + col3Width + col4Width + col5Width, row10Y, col6Width, boxHeight, '12d');

  // State and local boxes (15-20)
  const row11Y = row10Y + boxHeight;
  drawValueBox(doc, startX, row11Y, 50, boxHeight, '15  State', data.stateCode || '');
  drawValueBox(doc, startX + 50, row11Y, 80, boxHeight, 'Employer\'s state ID number', data.stateEmployerId || '');
  drawValueBox(doc, startX + 130, row11Y, col2Width, boxHeight, '16  State wages, tips, etc.', formatMoney(data.stateWages));
  drawValueBox(doc, startX + 130 + col2Width, row11Y, col3Width, boxHeight, '17  State income tax', formatMoney(data.stateWithholding));
  drawValueBox(doc, startX + 130 + col2Width + col3Width, row11Y, col4Width, boxHeight, '18  Local wages, tips, etc.', formatMoney(data.localWages));
  drawValueBox(doc, startX + 130 + col2Width + col3Width + col4Width, row11Y, col5Width, boxHeight, '19  Local income tax', formatMoney(data.localWithholding));
  drawValueBox(doc, startX + 130 + col2Width + col3Width + col4Width + col5Width, row11Y, col6Width, boxHeight, '20  Locality name', data.localityName || '');

  doc.fontSize(fontSize);
}

/**
 * Draw a labeled box on the PDF
 */
function drawBox(
  doc: PDFDoc,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
) {
  // Draw border
  doc.rect(x, y, width, height).stroke();

  // Draw label
  doc.fontSize(6).font('Helvetica').text(label, x + 2, y + 2);
}

/**
 * Draw a box with label and value
 */
function drawValueBox(
  doc: PDFDoc,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string
) {
  // Draw border
  doc.rect(x, y, width, height).stroke();

  // Draw label
  doc.fontSize(6).font('Helvetica').text(label, x + 2, y + 2);

  // Draw value (right-aligned for money)
  doc.fontSize(9).font('Helvetica-Bold');
  const valueWidth = doc.widthOfString(value);
  doc.text(value, x + width - valueWidth - 4, y + height - 14);
  doc.font('Helvetica');
}

/**
 * Draw a checkbox
 */
function drawCheckbox(
  doc: PDFDoc,
  x: number,
  y: number,
  checked: boolean
) {
  doc.rect(x, y, 8, 8).stroke();
  if (checked) {
    doc.fontSize(8).font('Helvetica-Bold').text('X', x + 1, y);
    doc.font('Helvetica');
  }
}

/**
 * Format number as money string
 */
function formatMoney(amount: number): string {
  if (amount === 0) return '';
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
