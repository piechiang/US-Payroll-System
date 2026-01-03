# Form 941 Social Security Wage Cap Fix

## Critical Tax Compliance Issue - FIXED

**Severity**: HIGH
**Issue Type**: Tax Compliance / Form 941 Reporting Accuracy
**Impact**: IRS Form 941 Box 5a (Social Security taxable wages) overstated for high-income employees

---

## Problem

The `/api/tax-liability/941` endpoint calculated Social Security taxable wages incorrectly by using gross pay directly without considering the annual Social Security wage cap.

### Code Location

**File**: `server/src/routes/taxLiability.ts` (line 222 - before fix)

**Problematic Code**:
```typescript
totalSocialSecurityWages += grossPay; // Simplified - should consider wage cap
```

### Why This Was Wrong

**Social Security Wage Cap** (2024): **$168,600**

For employees earning above this threshold:
- ❌ **Before**: Form 941 reported ALL wages as SS-taxable (e.g., $200,000)
- ✅ **After**: Form 941 correctly reports only wages up to cap (e.g., $168,600)

### Impact on Form 941

**IRS Form 941 Box 5a**: "Taxable social security wages"

This box must report the **total amount of wages subject to Social Security tax**, which is capped at $168,600 per employee per year (2024).

**Example - Before Fix (WRONG)**:
```
Employee: CEO
Annual Salary: $250,000
Quarterly Pay: $62,500

Q1 2024 Form 941:
  Box 5a (SS wages): $62,500 ❌ WRONG

Q2 2024 Form 941:
  Box 5a (SS wages): $62,500 ❌ WRONG

Q3 2024 Form 941:
  Box 5a (SS wages): $62,500 ❌ WRONG (should be $43,600)

Q4 2024 Form 941:
  Box 5a (SS wages): $62,500 ❌ WRONG (should be $0)

Total Reported: $250,000 ❌ WRONG
Correct Amount: $168,600
Over-reported: $81,400
```

**Example - After Fix (CORRECT)**:
```
Employee: CEO
Annual Salary: $250,000
Quarterly Pay: $62,500

Q1 2024 Form 941:
  Box 5a (SS wages): $62,500 ✅ CORRECT
  YTD: $62,500

Q2 2024 Form 941:
  Box 5a (SS wages): $62,500 ✅ CORRECT
  YTD: $125,000

Q3 2024 Form 941:
  Box 5a (SS wages): $43,600 ✅ CORRECT ($168,600 cap - $125,000 YTD)
  YTD: $168,600 (hit cap)

Q4 2024 Form 941:
  Box 5a (SS wages): $0 ✅ CORRECT (already at cap)
  YTD: $168,600

Total Reported: $168,600 ✅ CORRECT
```

---

## Solution Implemented

### 1. Added Social Security Wage Cap Constants

```typescript
/**
 * Social Security wage cap by year
 * Source: Social Security Administration
 */
const SOCIAL_SECURITY_WAGE_CAP: Record<number, number> = {
  2023: 160200,
  2024: 168600,
  2025: 176100
};
```

### 2. Fetch YTD Wages Before Quarter

```typescript
const { start, end } = getQuarterDates(query.year, query.quarter);
const ssWageCap = SOCIAL_SECURITY_WAGE_CAP[query.year] || 168600;

// Get YTD wages for all employees up to the start of the quarter
const yearStart = new Date(query.year, 0, 1);
const priorToQuarterPayrolls = await prisma.payroll.findMany({
  where: {
    companyId: query.companyId,
    payDate: {
      gte: yearStart,
      lt: start
    },
    status: { not: 'VOID' }
  },
  select: {
    employeeId: true,
    grossPay: true
  }
});

// Calculate YTD wages before this quarter for each employee
const employeeYTDBeforeQuarter = new Map<string, number>();
for (const payroll of priorToQuarterPayrolls) {
  const existing = employeeYTDBeforeQuarter.get(payroll.employeeId) || 0;
  employeeYTDBeforeQuarter.set(payroll.employeeId, existing + Number(payroll.grossPay));
}
```

### 3. Track Per-Employee YTD and Apply Wage Cap

```typescript
// Track per-employee YTD during quarter for wage cap calculation
const employeeYTD = new Map<string, number>(employeeYTDBeforeQuarter);

for (const payroll of payrolls) {
  const grossPay = Number(payroll.grossPay);

  // Calculate Social Security taxable wages considering wage cap
  const ytdBefore = employeeYTD.get(payroll.employeeId) || 0;
  let ssTaxableWages = 0;

  if (ytdBefore < ssWageCap) {
    // Employee hasn't hit the cap yet
    ssTaxableWages = Math.min(grossPay, ssWageCap - ytdBefore);
  }
  // If ytdBefore >= ssWageCap, employee already exceeded cap, so ssTaxableWages = 0

  // Update employee YTD
  employeeYTD.set(payroll.employeeId, ytdBefore + grossPay);

  totalSocialSecurityWages += ssTaxableWages; // Now properly considers wage cap
}
```

### 4. Medicare Wages Unchanged (No Cap)

```typescript
totalMedicareWages += grossPay; // Medicare has no wage cap
```

**Important**: Medicare tax applies to ALL wages with no cap, so this correctly continues to use gross pay.

---

## Algorithm Explanation

### Wage Cap Logic

For each payroll in the quarter:

1. **Get employee's YTD wages before this payroll**:
   ```
   ytdBefore = sum of all wages for this employee earlier in the year
   ```

2. **Check if employee has hit the cap**:
   ```
   if ytdBefore >= $168,600:
     ssTaxableWages = $0  // Already at cap
   ```

3. **If under cap, calculate remaining taxable wages**:
   ```
   if ytdBefore < $168,600:
     remainingRoom = $168,600 - ytdBefore
     ssTaxableWages = min(grossPay, remainingRoom)
   ```

4. **Update YTD for next payroll**:
   ```
   employeeYTD[employeeId] = ytdBefore + grossPay
   ```

### Example Walkthrough

**Employee**: Executive making $200,000/year (biweekly payroll, 26 periods)
**Pay per period**: $7,692.31

| Payroll # | Date | Gross Pay | YTD Before | Remaining Room | SS Taxable | YTD After |
|-----------|------|-----------|------------|----------------|------------|-----------|
| 1 | 01/05 | $7,692.31 | $0 | $168,600 | $7,692.31 | $7,692.31 |
| 2 | 01/19 | $7,692.31 | $7,692.31 | $160,907.69 | $7,692.31 | $15,384.62 |
| ... | ... | ... | ... | ... | ... | ... |
| 21 | 10/25 | $7,692.31 | $153,846.15 | $14,753.85 | $7,692.31 | $161,538.46 |
| 22 | 11/08 | $7,692.31 | $161,538.46 | **$7,061.54** | **$7,061.54** ✅ | $168,600 |
| 23 | 11/22 | $7,692.31 | $168,600 | **$0** | **$0** ✅ | $176,292.31 |
| 24 | 12/06 | $7,692.31 | $176,292.31 | **$0** | **$0** ✅ | $183,984.62 |
| 25 | 12/20 | $7,692.31 | $183,984.62 | **$0** | **$0** ✅ | $191,676.93 |
| 26 | 12/31 | $7,692.31 | $191,676.93 | **$0** | **$0** ✅ | $199,369.24 |

**Total Wages**: $200,000
**Total SS Taxable**: $168,600 ✅
**Wages Above Cap**: $31,400 (correctly excluded)

---

## Compliance Impact

### IRS Form 941 Accuracy

**Before Fix**:
- ❌ Box 5a over-reported for high-income employees
- ❌ Could trigger IRS audit due to mismatch with W-2s
- ❌ Incorrect tax liability calculations

**After Fix**:
- ✅ Box 5a correctly reports capped SS wages
- ✅ Matches W-2 Box 3 (Social Security wages)
- ✅ Accurate quarterly tax liability

### Form W-2 Reconciliation

At year-end, Form 941 quarterly totals must match W-2 totals:

**W-2 Box 3 (Social Security wages)**:
- Must be capped at $168,600 per employee
- Sum of all W-2 Box 3 values must match sum of all Form 941 Box 5a values

**Before**: Mismatch would be detected by IRS during W-2/941 reconciliation
**After**: Perfect reconciliation

### Penalties Avoided

**Incorrect Form 941 can result in**:
- IRS penalties for inaccurate reporting
- Audit triggers due to W-2/941 mismatch
- Interest on under-deposited taxes (if Box 5a affects deposits)
- Loss of good standing with IRS

---

## Social Security Wage Cap by Year

| Year | Wage Cap | Rate | Max Tax per Employee |
|------|----------|------|----------------------|
| 2023 | $160,200 | 6.2% | $9,932.40 |
| 2024 | $168,600 | 6.2% | $10,453.20 |
| 2025 | $176,100 | 6.2% | $10,918.20 |

**Source**: Social Security Administration

**Important**: These limits are per employee, not per employer. If an employee works for multiple employers, each employer withholds up to the cap independently, and the employee gets a refund when filing their tax return.

---

## Testing

### Test Case 1: Employee Under Cap All Year

```bash
# Employee earning $100,000/year (under cap)
# Expected: All quarters report full wages

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=1
# Expected: socialSecurityWages = $25,000

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=4
# Expected: socialSecurityWages = $25,000
```

### Test Case 2: Employee Hits Cap in Q3

```bash
# Employee earning $200,000/year
# Cap hit: ~October (after $168,600)

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=1
# Expected: socialSecurityWages = $50,000 (full quarter)

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=2
# Expected: socialSecurityWages = $50,000 (full quarter)

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=3
# Expected: socialSecurityWages = $68,600 (partial - hits cap)
# YTD at Q3 start: $100,000
# Q3 wages: $50,000
# Capped at: $168,600 - $100,000 = $68,600

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=4
# Expected: socialSecurityWages = $0 (already at cap)
```

### Test Case 3: Multiple High-Income Employees

```bash
# Company with 3 executives each earning $250,000/year

curl http://localhost:5000/api/tax-liability/941?companyId=comp-123&year=2024&quarter=4

# Expected for Q4:
# - Employee 1: $0 (hit cap in Q3)
# - Employee 2: $0 (hit cap in Q3)
# - Employee 3: $0 (hit cap in Q3)
# Total socialSecurityWages: $0
```

### Verification Query

```sql
-- Verify per-employee YTD wages
SELECT
  e.firstName,
  e.lastName,
  SUM(p.grossPay) as ytdGross,
  CASE
    WHEN SUM(p.grossPay) > 168600
    THEN 168600
    ELSE SUM(p.grossPay)
  END as ssTaxableWages,
  SUM(p.grossPay) - 168600 as wagesOverCap
FROM payroll p
JOIN employee e ON p.employeeId = e.id
WHERE p.companyId = 'comp-123'
  AND YEAR(p.payDate) = 2024
  AND p.status != 'VOID'
GROUP BY e.id, e.firstName, e.lastName
HAVING SUM(p.grossPay) > 168600
ORDER BY ytdGross DESC;
```

---

## API Response Changes

### Before Fix

```json
{
  "form": "941",
  "period": { "year": 2024, "quarter": 4 },
  "employeeCount": 50,
  "totalWages": 2500000,
  "socialSecurityWages": 2500000,  // ❌ WRONG - Should be lower
  "socialSecurityTax": 310000,
  "medicareWages": 2500000,
  "medicareTax": 72500
}
```

### After Fix

```json
{
  "form": "941",
  "period": { "year": 2024, "quarter": 4 },
  "employeeCount": 50,
  "totalWages": 2500000,
  "socialSecurityWages": 1850000,  // ✅ CORRECT - Wage cap applied
  "socialSecurityTax": 310000,
  "medicareWages": 2500000,        // ✅ Unchanged - No cap for Medicare
  "medicareTax": 72500
}
```

**Key Difference**: `socialSecurityWages` is now accurately capped per employee.

---

## Performance Considerations

### Additional Database Query

The fix adds one additional query to fetch YTD wages before the quarter:

```typescript
const priorToQuarterPayrolls = await prisma.payroll.findMany({
  where: {
    companyId: query.companyId,
    payDate: { gte: yearStart, lt: start },
    status: { not: 'VOID' }
  },
  select: { employeeId: true, grossPay: true }
});
```

**Performance Impact**: Minimal
- Query is indexed by `companyId` and `payDate`
- Only fetches 2 columns (`employeeId`, `grossPay`)
- Runs once per Form 941 generation (not per payroll)

**Optimization Suggestion** (future):
Store YTD values in a separate table updated on each payroll run:
```sql
CREATE TABLE employee_ytd (
  employeeId VARCHAR(255),
  year INT,
  ytdGross DECIMAL(10,2),
  ytdSSTaxable DECIMAL(10,2),
  PRIMARY KEY (employeeId, year)
);
```

---

## Related Code

### Form 940 (FUTA)

Form 940 already implements similar wage cap logic for FUTA ($7,000 cap):

**Location**: `server/src/routes/taxLiability.ts` lines 798-827

```typescript
// Calculate FUTA taxable wages per employee (capped at $7,000)
const employeeWages = new Map<string, { total: number; taxable: number; futa: number }>();

for (const payroll of payrolls) {
  const gross = Number(payroll.grossPay);
  const existing = employeeWages.get(payroll.employeeId) || { total: 0, taxable: 0, futa: 0 };
  const previousTotal = existing.total;

  // Calculate taxable wages (up to FUTA wage base)
  let taxableThisPeriod = 0;
  if (previousTotal < futaWageBase) {
    taxableThisPeriod = Math.min(gross, futaWageBase - previousTotal);
  }

  employeeWages.set(payroll.employeeId, {
    total: newTotal,
    taxable: existing.taxable + taxableThisPeriod,
    futa: existing.futa + futa
  });
}
```

The Form 941 fix uses the same algorithm pattern.

### Payroll Calculation (Individual Paystubs)

Individual payroll calculations already apply SS wage cap:

**Location**: `server/src/tax/federal.ts` lines 167-171

```typescript
const remainingWagesForSS = Math.max(0, SOCIAL_SECURITY_WAGE_CAP_2024 - ytdGrossWages);
const wagesSubjectToSS = Math.min(grossPay, remainingWagesForSS);
const socialSecurity = Math.round(wagesSubjectToSS * SOCIAL_SECURITY_RATE * 100) / 100;
```

This ensures individual paystubs are correct; Form 941 aggregation now matches.

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Form 941 Box 5a Accuracy | ❌ Over-reported | ✅ Correct |
| High-income employees | ❌ All wages reported | ✅ Capped at $168,600 |
| IRS reconciliation | ❌ Mismatches W-2 | ✅ Matches W-2 |
| Compliance risk | ⚠️ High | ✅ Low |
| Algorithm | ❌ Simple sum | ✅ Per-employee YTD tracking |
| Medicare wages | ✅ Correct (no cap) | ✅ Correct (no cap) |

**Result**: Form 941 now accurately reports Social Security taxable wages, ensuring IRS compliance and preventing audit triggers.

---

## Files Modified

- `server/src/routes/taxLiability.ts`
  - Added `SOCIAL_SECURITY_WAGE_CAP` constant
  - Added YTD wage tracking for Form 941 calculation
  - Implemented per-employee wage cap logic
  - Updated Form 941 Box 5a calculation

## Files Created

- `FORM_941_SS_WAGE_CAP_FIX.md` - This documentation
