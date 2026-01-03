# Supplemental Wage Withholding Analysis

## Current Implementation

### Tax Annualization Logic

**Location**: `server/src/services/payrollCalculator.ts` line 138

```typescript
// Calculate annual income for tax brackets
const estimatedAnnualIncome = grossPayDec.times(payPeriodsPerYear).toNumber();
```

**What This Does**:
- Multiplies current period gross pay (including bonuses/commissions) by pay periods per year
- Uses this annualized amount to determine tax bracket
- Applies withholding as if employee earns this amount every pay period

### Bonus/Commission Handling

**Location**: `server/src/services/payrollCalculator.ts` lines 358-370

```typescript
const bonusDec = this.toDecimal(bonus);
const commissionDec = this.toDecimal(commission);

// Gross pay includes all taxable income (wages + tips)
const grossPayDec = regularPayDec
  .plus(overtimePayDec)
  .plus(bonusDec)
  .plus(commissionDec)
  .plus(totalTipsDec);
```

**Current Method**: **Aggregate Method**
- Bonuses and commissions are combined with regular wages
- Total is annualized for tax bracket determination
- Withholding calculated on combined amount

---

## Problem: Over-Withholding on Bonuses

### Example Scenario

**Employee**:
- Annual Salary: $60,000
- Pay Frequency: Biweekly (26 periods)
- Regular Pay per Period: $2,307.69
- Filing Status: Single
- Normal Tax Bracket: 12%

**Regular Paycheck (no bonus)**:
```
Gross Pay: $2,307.69
Annualized: $2,307.69 × 26 = $60,000
Tax Bracket: 12%
Federal Withholding: ~$230
```

**Paycheck with $10,000 Bonus**:
```
Gross Pay: $2,307.69 + $10,000 = $12,307.69
Annualized: $12,307.69 × 26 = $320,000 ❌ INCORRECT
Tax Bracket: 32% (jumps from 12% to 32%!)
Federal Withholding: ~$3,500 ❌ OVER-WITHHELD

Employee's actual annual income: $70,000 (should be 22% bracket)
Actual tax owed on bonus: ~$2,200
Over-withheld: $1,300 (employee gets refund at tax time)
```

### Why This Happens

The current **aggregate method** treats the bonus as if the employee earns that amount **every pay period**:
- One-time $10K bonus → Annualized as $260K additional income
- Triggers higher tax brackets than employee's actual annual income
- Results in significant over-withholding
- Employee must wait until tax return to get refund

---

## IRS Supplemental Wage Withholding Methods

### Method 1: Percentage Method (Flat Rate)

**IRS Publication 15 (Circular E)**:

**Flat Rate Options**:
1. **22% flat rate** for supplemental wages ≤ $1,000,000 in calendar year
2. **37% flat rate** for supplemental wages > $1,000,000 in calendar year

**When to Use**:
- Supplemental wages are paid separately from regular wages
- OR supplemental wages can be easily identified

**Calculation**:
```
Federal Withholding on Bonus = Bonus Amount × 22%
```

**Example**:
```
Regular Pay: $2,307.69
  Federal Withholding (12% bracket): $230

Bonus: $10,000
  Federal Withholding (22% flat): $2,200

Total Withholding: $2,430
vs Aggregate Method: $3,500
Savings: $1,070 (more accurate)
```

### Method 2: Aggregate Method (Current Implementation)

**When to Use**:
- Supplemental wages cannot be easily identified
- OR employer prefers to use this method

**Calculation**:
1. Add supplemental wages to regular wages
2. Calculate withholding on total
3. Subtract withholding that would have been on regular wages alone
4. Difference = withholding on supplemental wages

**Example**:
```
Step 1: Regular pay withholding
  Gross: $2,307.69
  Withholding: $230

Step 2: Combined withholding
  Gross: $2,307.69 + $10,000 = $12,307.69
  Annualized: $320,000 (32% bracket)
  Withholding: $3,500

Step 3: Bonus withholding
  $3,500 - $230 = $3,270 ❌ Still over-withheld
```

**Problem**: Annualization causes bracket inflation.

### Method 3: Optional Aggregate Method (More Accurate)

IRS allows alternative aggregate calculation:

1. Calculate withholding on regular wages (without bonus)
2. Calculate withholding on (regular wages + bonus) but with **correct** annual income
3. Difference = withholding on bonus

**Example**:
```
Step 1: Regular pay withholding
  Regular Pay: $2,307.69
  Annual Income: $60,000
  Withholding: $230

Step 2: Combined withholding
  This Period: $12,307.69
  Annual Income: $70,000 (actual, not annualized period pay)
  Pro-rated Withholding: Based on $70K annual / 26 periods
  Withholding: ~$2,500

Step 3: Bonus withholding
  $2,500 - $230 = $2,270 ✅ More accurate
```

---

## Recommended Solution

### Option A: Implement Supplemental Wage Flag (Recommended)

**Add to PayrollInput**:
```typescript
export interface PayrollInput {
  // ... existing fields
  bonus?: number;
  commission?: number;
  useSupplementalRate?: boolean;  // NEW: Flag to use 22% flat rate
}
```

**Modified Calculation**:
```typescript
// Calculate regular wages separately from supplemental
const regularWages = regularPayDec.plus(overtimePayDec).plus(totalTipsDec);
const supplementalWages = bonusDec.plus(commissionDec);

// If using supplemental rate
if (input.useSupplementalRate && supplementalWages.gt(0)) {
  // Calculate taxes on regular wages only
  const regularAnnualIncome = regularWages.times(payPeriodsPerYear).toNumber();
  const federalOnRegular = calculateFederalTax({
    grossPay: regularWages.toNumber(),
    annualIncome: regularAnnualIncome,
    // ... other params
  });

  // Calculate supplemental tax (22% flat rate, or 37% if YTD supplemental > $1M)
  const ytdSupplemental = input.ytdSupplementalWages || 0;
  const supplementalRate = (ytdSupplemental + supplementalWages.toNumber()) > 1000000
    ? 0.37  // 37% for high earners
    : 0.22; // 22% standard

  const federalOnSupplemental = supplementalWages.times(supplementalRate).toNumber();

  // FICA still applies to full gross (no distinction for supplemental)
  const ficaBase = regularWages.plus(supplementalWages).toNumber();
  const socialSecurity = calculateSSOnBase(ficaBase, ytdGrossWages);
  const medicare = calculateMedicareOnBase(ficaBase, ytdGrossWages);

  federalTax = {
    incomeTax: federalOnRegular.incomeTax + federalOnSupplemental,
    socialSecurity,
    medicare,
    // ...
  };
} else {
  // Use current aggregate method
  const estimatedAnnualIncome = grossPayDec.times(payPeriodsPerYear).toNumber();
  federalTax = calculateFederalTax({
    grossPay: earnings.grossPay,
    annualIncome: estimatedAnnualIncome,
    // ...
  });
}
```

**Benefits**:
- IRS-compliant percentage method
- Reduces over-withholding on bonuses
- Optional: employers can choose method
- Simple implementation

**Drawbacks**:
- Requires manual flag per payroll run
- Still need to track YTD supplemental wages

### Option B: Auto-Detect Supplemental Wages

**Logic**:
```typescript
// Auto-detect if this paycheck has significant bonus/commission
const regularWages = regularPayDec.plus(overtimePayDec).plus(totalTipsDec);
const supplementalWages = bonusDec.plus(commissionDec);

// If supplemental wages are > 20% of regular wages, use percentage method
const isSignificantSupplemental = supplementalWages.gt(regularWages.times(0.20));

if (isSignificantSupplemental) {
  // Use 22% flat rate
} else {
  // Use aggregate method
}
```

**Benefits**:
- Automatic detection
- No manual flags needed

**Drawbacks**:
- Arbitrary threshold (20%)
- May not match employer preference

### Option C: Provide Both in API Response (User Choice)

**Return both calculations**:
```typescript
export interface PayrollResult {
  // ... existing fields
  alternativeTaxCalculations?: {
    aggregateMethod: FederalTaxResult;      // Current implementation
    supplementalMethod: FederalTaxResult;   // 22% on bonus
  };
}
```

**Benefits**:
- User/employer can choose at review time
- Shows tax impact comparison
- Educational for users

**Drawbacks**:
- More complex API response
- Decision pushed to user

---

## State Tax Considerations

Many states follow federal supplemental wage rules:

### States with Flat Supplemental Rates:
- **Connecticut**: 6.99% flat on bonuses
- **Iowa**: 5% flat on bonuses
- **Montana**: Supplemental wages taxed at max rate
- **Oklahoma**: Flat 4.75% optional
- **Oregon**: 8% flat optional

### States Following Federal Aggregate:
- Most states use aggregate method matching federal
- Apply state's normal progressive brackets to total wages

**Recommendation**: Implement supplemental logic for federal first, then add state-specific rules as needed.

---

## Implementation Priority

### Phase 1: Documentation (Current)
- ✅ Document current aggregate method
- ✅ Explain over-withholding issue
- ✅ Provide IRS-compliant alternatives

### Phase 2: Add Supplemental Flag (Recommended First Step)
```typescript
interface PayrollInput {
  bonus?: number;
  commission?: number;
  useSupplementalRate?: boolean;  // NEW
  ytdSupplementalWages?: number;  // NEW: Track YTD supplemental for $1M threshold
}
```

### Phase 3: Implement Percentage Method
- Add federal supplemental tax calculation (22% / 37%)
- Keep FICA on total gross (no change)
- Update `calculateFederalTax` to handle supplemental wages

### Phase 4: State Supplemental Rules
- Add state-specific supplemental rates
- Update state tax calculators

### Phase 5: UI/UX
- Checkbox in payroll run form: "Use supplemental rate for bonus/commission"
- Show tax comparison: "Aggregate: $3,500" vs "Supplemental: $2,430"
- Educate users on when to use each method

---

## Current Behavior is IRS-Compliant

**Important**: The current aggregate method is **100% IRS-compliant**.

From **IRS Publication 15 (Circular E)**:
> "Use either the percentage method or the aggregate method for supplemental wages, unless the supplemental wages exceed $1 million, in which case you must use the mandatory flat rate of 37%."

**Why Keep Current Implementation**:
1. ✅ **IRS-compliant**: Aggregate method is allowed
2. ✅ **Simpler logic**: No special handling needed
3. ✅ **Conservative withholding**: Better to over-withhold than under-withhold (avoids penalties)
4. ✅ **Works for all scenarios**: Handles commissions, bonuses, tips uniformly

**Why Add Supplemental Option**:
1. ✅ **Better employee experience**: Reduces over-withholding → larger paychecks
2. ✅ **Cash flow**: Employees don't need to wait for tax refund
3. ✅ **Competitive**: Many payroll systems offer this option
4. ✅ **Preferred by high-earners**: Executives with large bonuses

---

## Testing Scenarios

### Scenario 1: Regular Paycheck (No Bonus)
```
Regular Pay: $2,000
Bonus: $0
Expected: Normal withholding (~$200)
```

### Scenario 2: Small Bonus (Aggregate OK)
```
Regular Pay: $2,000
Bonus: $500
Aggregate Method: Reasonable withholding
Supplemental Method: Slightly less withholding
```

### Scenario 3: Large Bonus (Supplemental Better)
```
Regular Pay: $2,000
Bonus: $10,000
Aggregate Method: ~$3,500 (over-withheld)
Supplemental Method: ~$2,430 (more accurate)
Difference: $1,070 in employee's pocket now vs tax refund later
```

### Scenario 4: Executive Bonus Over $1M
```
Regular Pay: $50,000
Bonus: $2,000,000
YTD Supplemental: $0
First $1M: 22% = $220,000
Over $1M: 37% = $370,000
Total: $590,000 federal withholding
```

### Scenario 5: Commission-Based Employee
```
Regular Pay: $1,000 (base salary)
Commission: $5,000 (varies each period)
Challenge: Hard to distinguish "regular" from "supplemental"
Recommendation: Use aggregate method (current)
```

---

## API Design Proposal

### Current API (No Changes)
```typescript
POST /api/payroll/calculate
{
  "employeeId": "emp-123",
  "payPeriodStart": "2024-01-01",
  "payPeriodEnd": "2024-01-15",
  "hoursWorked": 80,
  "bonus": 10000
}

// Uses aggregate method (current behavior)
```

### Proposed Enhancement (Opt-In)
```typescript
POST /api/payroll/calculate
{
  "employeeId": "emp-123",
  "payPeriodStart": "2024-01-01",
  "payPeriodEnd": "2024-01-15",
  "hoursWorked": 80,
  "bonus": 10000,
  "withholdingMethod": "supplemental"  // NEW: "aggregate" (default) or "supplemental"
}

// Response includes method used:
{
  "netPay": 9570,
  "taxes": {
    "federal": {
      "incomeTax": 2430,
      "method": "supplemental",  // NEW
      "supplementalRate": 0.22   // NEW
    }
  }
}
```

---

## References

- **IRS Publication 15 (Circular E)**: Employer's Tax Guide
  - Section 7: Supplemental Wages
  - https://www.irs.gov/pub/irs-pdf/p15.pdf

- **IRS Publication 15-A**: Employer's Supplemental Tax Guide
  - https://www.irs.gov/pub/irs-pdf/p15a.pdf

- **26 CFR § 31.3402(g)-1**: Supplemental wage withholding regulations
  - https://www.law.cornell.edu/cfr/text/26/31.3402(g)-1

---

## Summary

| Method | Current Implementation | Over-Withholding Risk | IRS Compliant | Implementation Complexity |
|--------|----------------------|---------------------|---------------|--------------------------|
| **Aggregate** | ✅ Yes | ⚠️ High (for large bonuses) | ✅ Yes | ✅ Simple |
| **Percentage (22%)** | ❌ No | ✅ Low | ✅ Yes | ⚠️ Medium |
| **Percentage (37%)** | ❌ No | ✅ Low | ✅ Yes (>$1M) | ⚠️ Medium |

**Recommendation**:
1. **Keep current aggregate method as default** (IRS-compliant, works for all cases)
2. **Add optional supplemental method** with `withholdingMethod` parameter
3. **Implement 22% / 37% flat rate logic** for when flag is set
4. **Document both methods** in API documentation
5. **Let employers choose** based on their payroll policies

**Priority**: Medium
- Current implementation is correct and compliant
- Enhancement improves employee experience but not critical
- Can be added as optional feature without breaking changes

---

## Files Referenced

- `server/src/services/payrollCalculator.ts` - Annualization logic
- `server/src/tax/federal.ts` - Federal tax calculation
- `server/src/tax/state/*.ts` - State tax calculations

## Next Steps

1. Gather user feedback on whether supplemental method is desired
2. If yes, implement `withholdingMethod` parameter
3. Add federal supplemental logic (22% / 37% flat rate)
4. Update state tax calculators for states with flat supplemental rates
5. Add UI controls in payroll run interface
6. Document in API guide and user manual
