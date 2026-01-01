import { differenceInBusinessDays, startOfDay, endOfDay } from 'date-fns';
import { Decimal } from 'decimal.js';

export class ProrationCalculator {
  /**
   * Calculates the proration factor (0.0 - 1.0) based on hire/termination dates.
   * Uses Decimal.js for precise calculations.
   */
  static calculateProrationFactor(
    payPeriodStart: Date,
    payPeriodEnd: Date,
    hireDate: Date,
    terminationDate?: Date | null
  ): Decimal {
    const periodStart = startOfDay(payPeriodStart);
    const periodEnd = endOfDay(payPeriodEnd);
    const hDate = startOfDay(hireDate);
    const tDate = terminationDate ? endOfDay(terminationDate) : null;

    // 1. Normal case: Full period
    if (hDate <= periodStart && (!tDate || tDate >= periodEnd)) {
      return new Decimal(1);
    }

    // 2. Started during period
    let actualWorkStart = periodStart;
    if (hDate > periodStart && hDate <= periodEnd) {
      actualWorkStart = hDate;
    }

    // 3. Terminated during period
    let actualWorkEnd = periodEnd;
    if (tDate && tDate < periodEnd && tDate >= periodStart) {
      actualWorkEnd = tDate;
    }

    // If not working in this period at all
    if (actualWorkStart > actualWorkEnd) {
      return new Decimal(0);
    }

    // Calculate Business Days (Mon-Fri)
    // Note: differenceInBusinessDays excludes the end date, so we add 1
    const totalDaysInPeriod = differenceInBusinessDays(periodEnd, periodStart) + 1;
    const actualDaysWorked = differenceInBusinessDays(actualWorkEnd, actualWorkStart) + 1;

    if (totalDaysInPeriod === 0) return new Decimal(0);

    // Use Decimal.js for precise division
    const factor = new Decimal(actualDaysWorked).div(totalDaysInPeriod);

    // Clamp between 0 and 1
    return Decimal.max(0, Decimal.min(1, factor));
  }

  /**
   * Apply proration to a salary amount
   */
  static prorateAmount(amount: number | Decimal, prorationFactor: Decimal): Decimal {
    const amountDec = new Decimal(amount);
    return amountDec.times(prorationFactor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}