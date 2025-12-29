import { Employee, Company } from '@prisma/client';
import { calculateFederalTax, FederalTaxResult } from '../tax/federal.js';
import { calculateStateTax, StateTaxResult, UnsupportedStateError, isStateSupported } from '../tax/state/index.js';
import { calculateEmployerTax, EmployerTaxResult } from '../tax/employerTax.js';
import { calculateLocalTax, LocalTaxResult, hasLocalTax } from '../tax/local/index.js';

// Re-export for use in routes
export { UnsupportedStateError, isStateSupported, hasLocalTax };

export interface PayrollInput {
  employee: Employee & { company: Company };
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
  totalDeductions: number;           // Employee deductions only
  netPay: number;
  reimbursements: number;
  totalPay: number;                  // netPay + reimbursements
  totalEmployerCost: number;         // grossPay + employer taxes
}

export class PayrollCalculator {
  private readonly OVERTIME_MULTIPLIER = 1.5;
  private readonly PAY_PERIODS_PER_YEAR: Record<string, number> = {
    WEEKLY: 52,
    BIWEEKLY: 26,
    SEMIMONTHLY: 24,
    MONTHLY: 12
  };

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

    // Calculate earnings
    const earnings = this.calculateEarnings(input, payPeriodsPerYear);
    const retirement401k = this.calculateRetirement401k(employee, earnings.grossPay);
    const employer401kMatch = this.calculateEmployer401kMatch(
      employee.company,
      retirement401k,
      earnings.grossPay
    );

    // Calculate annual income for tax brackets
    const estimatedAnnualIncome = earnings.grossPay * payPeriodsPerYear;

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

    // Total employee deductions (including local taxes)
    let totalDeductions =
      federalTax.incomeTax +
      federalTax.socialSecurity +
      federalTax.medicare +
      stateTax.incomeTax +
      stateTax.sdi +
      stateTax.sui;

    // Add local taxes if applicable
    if (localTax) {
      totalDeductions += localTax.total;
    }

    totalDeductions += retirement401k;

    // Net pay calculation:
    // - grossPay includes all taxable income (wages + credit card tips + cash tips)
    // - Cash tips are already in employee's possession, so we subtract them from net pay
    // - Credit card tips are paid by employer, so they remain in net pay
    // Net pay = grossPay - totalDeductions - cashTips (since cash already received)
    const netPay = earnings.grossPay - totalDeductions - earnings.cashTips;
    const reimbursements = input.reimbursements || 0;

    // Total employer cost:
    // - Employer pays wages + credit card tips (not cash tips)
    // - Plus employer taxes on all gross pay (including tips)
    // - Plus 401k match
    const employerPaidEarnings = earnings.grossPay - earnings.cashTips;
    const totalEmployerCost = employerPaidEarnings + employerTaxes.total + employer401kMatch;

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
      retirement401k,
      employer401kMatch,
      employerTaxes,
      totalDeductions,
      netPay,
      reimbursements,
      totalPay: netPay + reimbursements,
      totalEmployerCost
    };
  }

  private calculateEarnings(input: PayrollInput, payPeriodsPerYear: number): PayrollEarnings {
    const {
      employee,
      hoursWorked = 0,
      overtimeHours = 0,
      bonus = 0,
      commission = 0,
      creditCardTips = 0,
      cashTips = 0
    } = input;

    let regularHours = 0;
    let regularPay = 0;
    let overtimePay = 0;

    if (employee.payType === 'HOURLY') {
      // Hourly employee
      const hourlyRate = Number(employee.payRate);
      regularHours = hoursWorked;
      regularPay = regularHours * hourlyRate;
      overtimePay = overtimeHours * hourlyRate * this.OVERTIME_MULTIPLIER;
    } else {
      // Salaried employee
      const annualSalary = Number(employee.payRate);
      regularPay = annualSalary / payPeriodsPerYear;
      regularHours = 40 * (52 / payPeriodsPerYear); // Standard hours for period

      // Salaried employees can still get overtime in some cases
      if (overtimeHours > 0) {
        // Calculate equivalent hourly rate for overtime
        const equivalentHourlyRate = annualSalary / (52 * 40);
        overtimePay = overtimeHours * equivalentHourlyRate * this.OVERTIME_MULTIPLIER;
      }
    }

    // Tips handling:
    // - Credit card tips: Paid by employer, included in gross pay for both taxes and net pay
    // - Cash tips: Already received by employee, included in gross pay for tax withholding only
    //   (not added to net pay since employee already has the cash)
    const totalTips = creditCardTips + cashTips;

    // Gross pay includes all taxable income (wages + tips)
    const grossPay = regularPay + overtimePay + bonus + commission + totalTips;

    return {
      regularHours,
      overtimeHours,
      regularPay: Math.round(regularPay * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      bonus,
      commission,
      creditCardTips: Math.round(creditCardTips * 100) / 100,
      cashTips: Math.round(cashTips * 100) / 100,
      totalTips: Math.round(totalTips * 100) / 100,
      grossPay: Math.round(grossPay * 100) / 100
    };
  }

  private calculateRetirement401k(employee: Employee, grossPay: number): number {
    const type = employee.retirement401kType;

    if (!type) {
      return 0;
    }

    if (type === 'PERCENT') {
      const rate = Number(employee.retirement401kRate || 0);
      const contribution = grossPay * (rate / 100);
      return Math.round(Math.min(contribution, grossPay) * 100) / 100;
    }

    if (type === 'FIXED') {
      const amount = Number(employee.retirement401kAmount || 0);
      return Math.round(Math.min(amount, grossPay) * 100) / 100;
    }

    return 0;
  }

  private calculateEmployer401kMatch(company: Company, employeeContribution: number, grossPay: number): number {
    const matchRate = Number(company.retirement401kMatchRate || 0);

    if (matchRate <= 0 || employeeContribution <= 0 || grossPay <= 0) {
      return 0;
    }

    const matchLimitPercent = company.retirement401kMatchLimitPercent;
    const maxEligibleContribution = matchLimitPercent !== null && matchLimitPercent !== undefined
      ? grossPay * (Number(matchLimitPercent) / 100)
      : grossPay;

    const eligibleContribution = Math.min(employeeContribution, maxEligibleContribution);
    const match = eligibleContribution * (matchRate / 100);

    return Math.round(Math.min(match, grossPay) * 100) / 100;
  }
}
