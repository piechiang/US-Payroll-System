import { PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

export class GLExportService {
  /**
   * Generates a General Ledger CSV compatible with QuickBooks
   * Uses Decimal.js for precise financial calculations
   */
  static async generateQuickBooksCSV(companyId: string, payPeriodStart: Date, payPeriodEnd: Date) {
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        payPeriodStart,
        payPeriodEnd
      },
      include: {
        employee: true
      }
    });

    let wagesExpense = new Decimal(0);
    let employerTaxExpense = new Decimal(0);
    let totalTaxLiability = new Decimal(0);
    let cashOut = new Decimal(0);

    payrolls.forEach(p => {
      const gross = new Decimal(p.grossPay);
      const employerTax = new Decimal(p.totalEmployerTax);

      // Calculate total employee taxes withheld based on schema fields
      const employeeTax = new Decimal(p.federalWithholding)
        .plus(p.socialSecurity)
        .plus(p.medicare)
        .plus(p.stateWithholding)
        .plus(p.localWithholding);

      wagesExpense = wagesExpense.plus(gross);
      employerTaxExpense = employerTaxExpense.plus(employerTax);
      totalTaxLiability = totalTaxLiability.plus(employeeTax).plus(employerTax);
      cashOut = cashOut.plus(p.netPay);
    });

    const journalDate = payPeriodEnd.toISOString().split('T')[0];

    // Standard CSV: Date, Description, Account, Debit, Credit
    const rows = [
      // Debit: Wages Expense
      {
        Date: journalDate,
        Description: 'Payroll Wages',
        Account: 'Payroll Expenses:Wages',
        Debit: wagesExpense.toFixed(2),
        Credit: ''
      },
      // Debit: Employer Tax Expense
      {
        Date: journalDate,
        Description: 'Payroll Taxes Employer',
        Account: 'Payroll Expenses:Taxes',
        Debit: employerTaxExpense.toFixed(2),
        Credit: ''
      },
      // Credit: Cash (Net Pay)
      {
        Date: journalDate,
        Description: 'Net Pay Check',
        Account: 'Bank:Checking',
        Debit: '',
        Credit: cashOut.toFixed(2)
      },
      // Credit: Tax Liability (Employer + Employee portions)
      {
        Date: journalDate,
        Description: 'Tax Liability',
        Account: 'Payroll Liabilities',
        Debit: '',
        Credit: totalTaxLiability.toFixed(2)
      }
    ];

    return stringify(rows, { header: true });
  }

  /**
   * Generate IIF format for QuickBooks Desktop
   */
  static async generateQuickBooksIIF(companyId: string, payPeriodStart: Date, payPeriodEnd: Date): Promise<string> {
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        payPeriodStart,
        payPeriodEnd
      },
      include: {
        employee: true
      }
    });

    let wagesExpense = new Decimal(0);
    let employerTaxExpense = new Decimal(0);
    let totalTaxLiability = new Decimal(0);
    let cashOut = new Decimal(0);

    payrolls.forEach(p => {
      const gross = new Decimal(p.grossPay);
      const employerTax = new Decimal(p.totalEmployerTax);
      const employeeTax = new Decimal(p.federalWithholding)
        .plus(p.socialSecurity)
        .plus(p.medicare)
        .plus(p.stateWithholding)
        .plus(p.localWithholding);

      wagesExpense = wagesExpense.plus(gross);
      employerTaxExpense = employerTaxExpense.plus(employerTax);
      totalTaxLiability = totalTaxLiability.plus(employeeTax).plus(employerTax);
      cashOut = cashOut.plus(p.netPay);
    });

    const journalDate = payPeriodEnd.toISOString().split('T')[0].replace(/-/g, '/');

    // IIF Format for QuickBooks Desktop
    const lines = [
      '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO',
      '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO',
      '!ENDTRNS',
      `TRNS\t\tGENERAL JOURNAL\t${journalDate}\t\t\t\t\t\tPayroll Entry`,
      `SPL\t\tGENERAL JOURNAL\t${journalDate}\tPayroll Expenses:Wages\t\t\t${wagesExpense.toFixed(2)}\t\tPayroll Wages`,
      `SPL\t\tGENERAL JOURNAL\t${journalDate}\tPayroll Expenses:Taxes\t\t\t${employerTaxExpense.toFixed(2)}\t\tEmployer Taxes`,
      `SPL\t\tGENERAL JOURNAL\t${journalDate}\tBank:Checking\t\t\t-${cashOut.toFixed(2)}\t\tNet Pay`,
      `SPL\t\tGENERAL JOURNAL\t${journalDate}\tPayroll Liabilities\t\t\t-${totalTaxLiability.toFixed(2)}\t\tTax Liability`,
      'ENDTRNS'
    ];

    return lines.join('\n');
  }
}