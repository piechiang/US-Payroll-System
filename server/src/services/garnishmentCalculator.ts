import { Decimal } from 'decimal.js';
import { Garnishment } from '@prisma/client';

export class GarnishmentCalculator {
  /**
   * Calculates deduction amounts for the current period.
   * @param disposableEarnings Disposable Income (Gross - Taxes)
   * @param garnishments List of active garnishmnets for the employee
   */
  static calculateDeductions(
    disposableEarnings: Decimal,
    garnishments: Garnishment[]
  ): { totalDeduction: Decimal; details: any[] } {
    let remainingDisposable = disposableEarnings;
    let totalDeducted = new Decimal(0);
    const details: any[] = [];

    // Federal Limit: Generally 25% of disposable earnings
    // Note: Child Support can be higher (50-65%), simplified here to 25% for general implementation
    const federalLimit = disposableEarnings.times(0.25);
    let maxAllowedDeduction = federalLimit;

    // Sort by priority
    const sortedGarnishments = [...garnishments].sort((a, b) => a.priority - b.priority);

    for (const g of sortedGarnishments) {
      if (!g.active) continue;
      if (maxAllowedDeduction.lte(0)) break;

      let amountToDeduct = new Decimal(0);

      // Calculate target amount
      if (g.amount.gt(0)) {
        amountToDeduct = new Decimal(g.amount);
      } else if (g.percent && g.percent.gt(0)) {
        amountToDeduct = disposableEarnings.times(g.percent.div(100));
      }

      // Check total owed balance
      if (g.totalOwed && g.totalPaid) {
        const remainingOwed = new Decimal(g.totalOwed).minus(g.totalPaid);
        if (remainingOwed.lte(0)) continue;
        if (amountToDeduct.gt(remainingOwed)) {
          amountToDeduct = remainingOwed;
        }
      }

      // Apply Federal Limit
      if (amountToDeduct.gt(maxAllowedDeduction)) {
        amountToDeduct = maxAllowedDeduction;
      }

      if (amountToDeduct.gt(0)) {
        totalDeducted = totalDeducted.plus(amountToDeduct);
        maxAllowedDeduction = maxAllowedDeduction.minus(amountToDeduct);
        
        details.push({
          garnishmentId: g.id,
          type: g.type,
          amount: amountToDeduct.toNumber()
        });
      }
    }

    return { totalDeduction: totalDeducted, details };
  }
}