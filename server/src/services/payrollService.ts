import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { ProrationCalculator } from './prorationCalculator.js';
import { GarnishmentCalculator } from './garnishmentCalculator.js';
import { AppError } from '../utils/AppError.js';

const prisma = new PrismaClient();

export class PayrollService {
  /**
   * Calculate and create payroll records for a given pay period
   */
  static async runPayroll(
    companyId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
    payDate: Date
  ) {
    // 1. Fetch employees with active garnishmnets
    const employees = await prisma.employee.findMany({
      where: { companyId, isActive: true },
      include: { garnishments: { where: { active: true } } }
    });

    if (employees.length === 0) {
      throw new AppError('No active employees found for this company', 404);
    }

    const results = [];

    for (const employee of employees) {
      // 2. Calculate Proration (New Feature)
      const prorationFactor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        employee.hireDate,
        employee.terminationDate
      );

      // Skip if employee didn't work in this period
      if (prorationFactor === 0) continue;

      // 3. Calculate Gross Pay
      let grossPay = new Decimal(0);
      if (employee.payType === 'SALARY') {
        // Assuming 26 pay periods for bi-weekly (simplified)
        const annualSalary = new Decimal(employee.payRate);
        const periodPay = annualSalary.div(26);
        grossPay = periodPay.times(prorationFactor);
      } else {
        // Hourly logic (simplified placeholder)
        // In production, you would fetch hours from TimeEntries
        grossPay = new Decimal(employee.payRate).times(80).times(prorationFactor);
      }

      // 4. Calculate Taxes (Simplified Mock for demonstration)
      const federalTax = grossPay.times(0.10);
      const socialSecurity = grossPay.times(0.062);
      const medicare = grossPay.times(0.0145);
      const stateTax = grossPay.times(0.05);
      
      const totalTaxes = federalTax.plus(socialSecurity).plus(medicare).plus(stateTax);

      // 5. Calculate Garnishments (New Feature)
      const disposableEarnings = grossPay.minus(totalTaxes);
      const { totalDeduction: garnishmentAmount, details: garnishmentDetails } = 
        GarnishmentCalculator.calculateDeductions(disposableEarnings, employee.garnishments);

      // 6. Calculate Net Pay
      const netPay = disposableEarnings.minus(garnishmentAmount);

      // 7. Save to DB
      const payroll = await prisma.payroll.create({
        data: {
          companyId,
          employeeId: employee.id,
          payPeriodStart,
          payPeriodEnd,
          payDate,
          grossPay,
          federalWithholding: federalTax,
          socialSecurity,
          medicare,
          stateWithholding: stateTax,
          garnishments: garnishmentAmount,
          totalDeductions: totalTaxes.plus(garnishmentAmount),
          netPay,
          regularPay: grossPay, // simplified
        }
      });
      
      results.push(payroll);
    }

    return results;
  }
}