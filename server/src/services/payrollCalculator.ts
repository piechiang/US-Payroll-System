import { Employee, Company, Garnishment } from '@prisma/client';
import { Decimal } from 'decimal.js'; // 需要先安装: npm install decimal.js
import { calculateFederalTax, FederalTaxResult } from '../tax/federal.js';
import { calculateStateTax, StateTaxResult, UnsupportedStateError, isStateSupported } from '../tax/state/index.js';
import { calculateEmployerTax, EmployerTaxResult } from '../tax/employerTax.js';
import { calculateLocalTax, LocalTaxResult, hasLocalTax } from '../tax/local/index.js';
import { ProrationCalculator } from './prorationCalculator.js';
import { GarnishmentCalculator } from './garnishmentCalculator.js';

// Re-export for use in routes
export { UnsupportedStateError, isStateSupported, hasLocalTax };

export interface PayrollInput {
  employee: Employee & {
    company: Company;
    garnishments?: Garnishment[];  // Optional: active garnishments for this employee
  };
  payPeriodStart: Date;
  payPeriodEnd: Date;
  hoursWorked?: number;      // For hourly employees
  overtimeHours?: number;    // Hours over 40
  bonus?: number;
  commission?: number;
  reimbursements?: number;   // Non-taxable reimbursements
  ytdGrossWages?: number;    // YTD gross wages for wage cap calculations
  sutaRate?: number;         // Employer's SUTA rate (experience rating)
  // Tips
  creditCardTips?: number;   // Tips from credit card payments (employer distributes)
  cashTips?: number;         // Cash tips reported by employee (for tax withholding)
  // Local tax fields
  city?: string;             // Employee's city for local tax
  county?: string;           // Employee's county (for MD, OH)
  isResident?: boolean;      // Is employee resident of the city?
  workCity?: string;         // City where work is performed
  workState?: string;        // State where work is performed
}

export interface PayrollEarnings {
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonus: number;
  commission: number;
  creditCardTips: number;    // Tips from credit card (paid by employer)
  cashTips: number;          // Cash tips reported (for tax withholding only)
  totalTips: number;         // Total tips (credit card + cash)
  grossPay: number;          // Total taxable earnings (includes all tips)
  prorationFactor?: number;  // Proration factor if mid-period hire/termination (0.0 - 1.0)
  proratedAmount?: number;   // Amount prorated (only if factor < 1.0)
}

export interface PayrollResult {
  employee: {
    id: string;
    name: string;
  };
  payPeriod: {
    start: Date;
    end: Date;
  };
  earnings: PayrollEarnings;
  taxes: {
    federal: FederalTaxResult;
    state: StateTaxResult;
    local: LocalTaxResult | null;
  };
  retirement401k: number;            // Employee 401(k) contribution
  employer401kMatch: number;         // Employer 401(k) match
  employerTaxes: EmployerTaxResult;  // Employer-paid taxes (FUTA, SUTA, FICA match)
  garnishments: number;              // Total garnishment deductions
  garnishmentDetails?: Array<{       // Detailed breakdown of garnishments
    garnishmentId: string;
    description: string;
    amount: number;
  }>;
  totalEmployeeTaxes: number;        // Sum of all employee taxes (federal + state + local)
  totalDeductions: number;           // Total employee deductions (taxes + 401k + garnishments)
  netPay: number;
  reimbursements: number;
  totalPay: number;                  // netPay + reimbursements
  totalEmployerCost: number;         // grossPay + employer taxes
}

export class PayrollCalculator {
  private readonly OVERTIME_MULTIPLIER = new Decimal(1.5);
  private readonly PAY_PERIODS_PER_YEAR: Record<string, number> = {
    WEEKLY: 52,
    BIWEEKLY: 26,
    SEMIMONTHLY: 24,
    MONTHLY: 12
  };

  /**
   * Helper to convert number/string to Decimal safely
   */
  private toDecimal(val: number | string | Decimal | undefined | null): Decimal {
    return new Decimal(val || 0);
  }

  /**
   * Helper to round to 2 decimal places (cents)
   */
  private round(val: Decimal): number {
    return val.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  calculate(input: PayrollInput): PayrollResult {
    const {
      employee,
      payPeriodStart,
      payPeriodEnd,
      ytdGrossWages = 0,
      sutaRate,
      city,
      county,
      workCity,
      workState
    } = input;
    const payFrequency = employee.company.payFrequency;
    const payPeriodsPerYear = this.PAY_PERIODS_PER_YEAR[payFrequency];

    // Calculate earnings (High Precision)
    const earnings = this.calculateEarnings(input, payPeriodsPerYear);

    // Convert gross pay to Decimal for subsequent calculations
    const grossPayDec = this.toDecimal(earnings.grossPay);
    const cashTipsDec = this.toDecimal(earnings.cashTips);

    const retirement401k = this.calculateRetirement401k(employee, grossPayDec);
    const employer401kMatch = this.calculateEmployer401kMatch(
      employee.company,
      retirement401k,
      grossPayDec
    );

    // Calculate annual income for tax brackets
    const estimatedAnnualIncome = grossPayDec.times(payPeriodsPerYear).toNumber();

    // Calculate federal taxes (pass YTD wages for FICA wage cap)
    // Include W-4 Step 4(a) otherIncome and Step 4(b) deductions
    const federalTax = calculateFederalTax({
      grossPay: earnings.grossPay,
      annualIncome: estimatedAnnualIncome,
      filingStatus: employee.filingStatus,
      allowances: employee.allowances,
      additionalWithholding: Number(employee.additionalWithholding),
      otherIncome: Number(employee.otherIncome || 0),     // W-4 Step 4(a)
      deductions: Number(employee.deductions || 0),       // W-4 Step 4(b)
      payPeriodsPerYear,
      ytdGrossWages // For Social Security wage cap
    });

    // Calculate state taxes (pass YTD wages for SDI wage cap)
    const stateTax = calculateStateTax({
      state: employee.state,
      grossPay: earnings.grossPay,
      annualIncome: estimatedAnnualIncome,
      filingStatus: employee.filingStatus,
      payPeriodsPerYear,
      ytdGrossWages // For SDI wage cap (e.g., California)
    });

    // Calculate local/city taxes (Maryland requires county-based local tax)
    let localTax: LocalTaxResult | null = null;
    const isMaryland = employee.state === 'MD';
    const localCity = isMaryland
      ? (city || employee.city)
      : (workCity || city || employee.workCity || employee.city);
    const localCounty = county || employee.county || undefined;
    const localState = isMaryland
      ? employee.state
      : (workState || employee.workState || employee.state);
    const localResident = isMaryland
      ? true
      : (input.isResident ?? employee.localResident ?? true);
    if (localCity && (isMaryland || hasLocalTax(localCity, localState))) {
      localTax = calculateLocalTax({
        city: localCity,
        state: localState,
        county: localCounty,
        grossPay: earnings.grossPay,
        annualIncome: estimatedAnnualIncome,
        filingStatus: employee.filingStatus,
        payPeriodsPerYear,
        isResident: localResident,
        workCity
      });
    }

    // Calculate employer taxes (FUTA, SUTA, FICA match)
    const employerTaxes = calculateEmployerTax({
      grossPay: earnings.grossPay,
      state: employee.state,
      ytdGrossWages,
      sutaRate
    });

    // Calculate total employee taxes (using Decimals for precision)
    const fedTaxSum = this.toDecimal(federalTax.incomeTax)
      .plus(federalTax.socialSecurity)
      .plus(federalTax.medicare);

    const stateTaxSum = this.toDecimal(stateTax.incomeTax)
      .plus(stateTax.sdi)
      .plus(stateTax.sui);

    let totalEmployeeTaxesDec = fedTaxSum.plus(stateTaxSum);

    // Add local taxes if applicable
    if (localTax) {
      totalEmployeeTaxesDec = totalEmployeeTaxesDec.plus(localTax.total);
    }

    // Calculate garnishment deductions (after taxes, using disposable earnings)
    // Disposable earnings = Gross pay - All legally required deductions (taxes)
    const disposableEarningsDec = grossPayDec.minus(totalEmployeeTaxesDec);

    let garnishmentDeductionDec = new Decimal(0);
    let garnishmentDetails: Array<{ garnishmentId: string; description: string; amount: number }> | undefined;

    if (employee.garnishments && employee.garnishments.length > 0) {
      const garnishmentResult = GarnishmentCalculator.calculateDeductions(
        disposableEarningsDec,
        employee.garnishments
      );

      garnishmentDeductionDec = garnishmentResult.totalDeduction;

      // Map garnishment details with descriptions
      garnishmentDetails = garnishmentResult.details.map(detail => {
        const garnishment = employee.garnishments!.find(g => g.id === detail.garnishmentId);
        return {
          garnishmentId: detail.garnishmentId,
          description: garnishment?.description || 'Garnishment',
          amount: detail.amount
        };
      });
    }

    // Total deductions = taxes + 401k contributions + garnishments
    const totalDeductionsDec = totalEmployeeTaxesDec
      .plus(retirement401k)
      .plus(garnishmentDeductionDec);

    // Net pay calculation:
    // - grossPay includes all taxable income (wages + credit card tips + cash tips)
    // - Cash tips are already in employee's possession, so we subtract them from net pay
    // - Credit card tips are paid by employer, so they remain in net pay
    // Net pay = grossPay - totalDeductions - cashTips (since cash already received)
    const netPayDec = grossPayDec.minus(totalDeductionsDec).minus(cashTipsDec);
    const reimbursementsDec = this.toDecimal(input.reimbursements);

    // Total employer cost:
    // - Employer pays wages + credit card tips (not cash tips)
    // - Plus employer taxes on all gross pay (including tips)
    // - Plus 401k match
    const employerPaidEarningsDec = grossPayDec.minus(cashTipsDec);
    const totalEmployerCostDec = employerPaidEarningsDec
      .plus(employerTaxes.total)
      .plus(employer401kMatch);

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`
      },
      payPeriod: {
        start: payPeriodStart,
        end: payPeriodEnd
      },
      earnings,
      taxes: {
        federal: federalTax,
        state: stateTax,
        local: localTax
      },
      retirement401k: this.round(this.toDecimal(retirement401k)),
      employer401kMatch: this.round(this.toDecimal(employer401kMatch)),
      employerTaxes,
      garnishments: this.round(garnishmentDeductionDec),
      garnishmentDetails,
      totalEmployeeTaxes: this.round(totalEmployeeTaxesDec),
      totalDeductions: this.round(totalDeductionsDec),
      netPay: this.round(netPayDec),
      reimbursements: this.round(reimbursementsDec),
      totalPay: this.round(netPayDec.plus(reimbursementsDec)),
      totalEmployerCost: this.round(totalEmployerCostDec)
    };
  }

  private calculateEarnings(input: PayrollInput, payPeriodsPerYear: number): PayrollEarnings {
    const {
      employee,
      payPeriodStart,
      payPeriodEnd,
      hoursWorked = 0,
      overtimeHours = 0,
      bonus = 0,
      commission = 0,
      creditCardTips = 0,
      cashTips = 0
    } = input;

    let regularPayDec = new Decimal(0);
    let overtimePayDec = new Decimal(0);
    let regularHours = 0;
    let prorationFactor: Decimal | undefined;
    let proratedAmount: number | undefined;

    if (employee.payType === 'HOURLY') {
      // Hourly employee - no proration needed (paid for actual hours worked)
      const hourlyRate = this.toDecimal(Number(employee.payRate));
      regularHours = hoursWorked;
      regularPayDec = hourlyRate.times(hoursWorked);
      overtimePayDec = hourlyRate.times(overtimeHours).times(this.OVERTIME_MULTIPLIER);
    } else {
      // Salaried employee - apply proration for mid-period hire/termination
      const annualSalary = this.toDecimal(Number(employee.payRate));
      let baseSalaryForPeriod = annualSalary.div(payPeriodsPerYear);
      regularHours = 40 * (52 / payPeriodsPerYear); // Standard hours for period

      // Calculate proration factor for hire/termination dates
      prorationFactor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        employee.hireDate,
        employee.terminationDate
      );

      // Apply proration if employee didn't work the full period
      if (prorationFactor.lt(1)) {
        const fullPeriodSalary = baseSalaryForPeriod;
        regularPayDec = ProrationCalculator.prorateAmount(baseSalaryForPeriod, prorationFactor);
        proratedAmount = this.round(fullPeriodSalary.minus(regularPayDec));
      } else {
        regularPayDec = baseSalaryForPeriod;
      }

      // Salaried employees can still get overtime in some cases
      if (overtimeHours > 0) {
        // Calculate equivalent hourly rate for overtime
        const equivalentHourlyRate = annualSalary.div(2080);
        overtimePayDec = equivalentHourlyRate.times(overtimeHours).times(this.OVERTIME_MULTIPLIER);
      }
    }

    // Tips handling:
    // - Credit card tips: Paid by employer, included in gross pay for both taxes and net pay
    // - Cash tips: Already received by employee, included in gross pay for tax withholding only
    //   (not added to net pay since employee already has the cash)
    const bonusDec = this.toDecimal(bonus);
    const commissionDec = this.toDecimal(commission);
    const creditCardTipsDec = this.toDecimal(creditCardTips);
    const cashTipsDec = this.toDecimal(cashTips);

    const totalTipsDec = creditCardTipsDec.plus(cashTipsDec);

    // Gross pay includes all taxable income (wages + tips)
    const grossPayDec = regularPayDec
      .plus(overtimePayDec)
      .plus(bonusDec)
      .plus(commissionDec)
      .plus(totalTipsDec);

    return {
      regularHours,
      overtimeHours,
      regularPay: this.round(regularPayDec),
      overtimePay: this.round(overtimePayDec),
      bonus: this.round(bonusDec),
      commission: this.round(commissionDec),
      creditCardTips: this.round(creditCardTipsDec),
      cashTips: this.round(cashTipsDec),
      totalTips: this.round(totalTipsDec),
      grossPay: this.round(grossPayDec),
      prorationFactor: prorationFactor ? this.round(prorationFactor) : undefined,
      proratedAmount
    };
  }

  private calculateRetirement401k(employee: Employee, grossPayDec: Decimal): number {
    const type = employee.retirement401kType;

    if (!type) {
      return 0;
    }

    let contributionDec = new Decimal(0);

    if (type === 'PERCENT') {
      const rate = this.toDecimal(Number(employee.retirement401kRate || 0));
      contributionDec = grossPayDec.times(rate.div(100));
    }

    if (type === 'FIXED') {
      contributionDec = this.toDecimal(Number(employee.retirement401kAmount || 0));
    }

    // Contribution cannot exceed gross pay
    if (contributionDec.gt(grossPayDec)) {
      contributionDec = grossPayDec;
    }

    return this.round(contributionDec);
  }

  private calculateEmployer401kMatch(company: Company, employeeContribution: number, grossPayDec: Decimal): number {
    const matchRate = this.toDecimal(Number(company.retirement401kMatchRate || 0));
    const employeeContribDec = this.toDecimal(employeeContribution);

    if (matchRate.lte(0) || employeeContribDec.lte(0) || grossPayDec.lte(0)) {
      return 0;
    }

    const matchLimitPercent = company.retirement401kMatchLimitPercent;

    // Determine the maximum contribution eligible for matching
    let maxEligibleDec = grossPayDec;
    if (matchLimitPercent !== null && matchLimitPercent !== undefined) {
      maxEligibleDec = grossPayDec.times(this.toDecimal(Number(matchLimitPercent)).div(100));
    }

    // Eligible contribution is the lesser of actual contribution or the limit
    const eligibleDec = Decimal.min(employeeContribDec, maxEligibleDec);

    const matchDec = eligibleDec.times(matchRate.div(100));

    // Match cannot exceed gross pay (safeguard)
    const finalMatch = Decimal.min(matchDec, grossPayDec);

    return this.round(finalMatch);
  }
}
