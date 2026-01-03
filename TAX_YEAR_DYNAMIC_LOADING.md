# Tax Year Dynamic Loading - Critical Compliance Issue

## CRITICAL: Hardcoded 2024 Tax Tables

**Severity**: CRITICAL
**Issue Type**: Tax Compliance / Multi-Year Support
**Impact**: 2025+ payrolls will use incorrect 2024 tax rates, brackets, and wage caps

---

## Problem

### Tax Calculators Use Hardcoded 2024 Values

**Location**: `server/src/tax/federal.ts`

**Hardcoded Constants**:
```typescript
// Line 37: Hardcoded 2024 brackets
const TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 11600, rate: 0.10, base: 0 },
    // ... more brackets
  ],
  // ...
};

// Line 79: Hardcoded 2024 standard deductions
const ANNUAL_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  // ...
};

// Line 88: Hardcoded 2024 wage cap
const SOCIAL_SECURITY_WAGE_CAP_2024 = 168600;
```

**Problem**: These values are used regardless of the actual tax year of the payroll.

### Config Loader Exists But Unused

**Available Infrastructure**:
- ✅ `taxConfigLoader.ts` - Fully implemented, ready to use
- ✅ `federal-2024.json` - 2024 tax configuration
- ✅ `federal-2025.json` - 2025 tax configuration (NOT BEING USED!)
- ✅ Fallback logic to closest year
- ✅ Caching for performance

**Status**: Implemented but never called by tax calculators

---

## Impact

### Example: January 2025 Payroll

**Employee**:
- Annual Salary: $180,000
- Filing Status: Single
- Pay Date: January 15, 2025

**Current Behavior (WRONG)**:
```typescript
// Uses hardcoded 2024 values
Social Security Cap: $168,600 (2024)
  ❌ Should be: $176,100 (2025)
  ❌ Under-withholds SS tax by $465.30 per employee over cap

Standard Deduction: $14,600 (2024)
  ❌ Should be: $15,000 (2025)
  ❌ Over-withholds income tax

Tax Brackets: 2024 brackets
  ❌ Should be: 2025 brackets (inflation-adjusted)
  ❌ Incorrect withholding for all employees
```

**Compliance Risk**:
- IRS penalties for incorrect withholding
- W-2 forms show wrong amounts
- Employees under/over-withheld
- Company liable for tax shortfalls

### Specific Tax Differences (2024 vs 2025)

| Item | 2024 Value | 2025 Value | Impact if Wrong |
|------|------------|------------|-----------------|
| **Social Security Wage Cap** | $168,600 | $176,100 | Under-withhold $465.30 per high earner |
| **Standard Deduction (Single)** | $14,600 | $15,000 | Over-withhold ~$40-88 per year |
| **Standard Deduction (MFJ)** | $29,200 | $30,000 | Over-withhold ~$80-176 per year |
| **Tax Bracket 10% Limit (Single)** | $11,600 | $11,925 | Incorrect bracket calculation |
| **Tax Bracket 12% Limit (Single)** | $47,150 | $48,475 | Incorrect bracket calculation |

**IRS Source**: IRS Rev. Proc. 2024-40 (2025 inflation adjustments)

---

## Solution

### Step 1: Determine Tax Year from Pay Date

**Add helper function**:
```typescript
/**
 * Determine tax year from pay date
 * Tax year changes on January 1
 */
function getTaxYear(payDate: Date): number {
  return payDate.getFullYear();
}
```

**Usage**:
```typescript
const taxYear = getTaxYear(new Date(payPeriodEnd));
const federalConfig = loadFederalConfig(taxYear);
```

### Step 2: Update Federal Tax Calculator

**Current (federal.ts)**:
```typescript
// ❌ WRONG - Hardcoded 2024
const brackets = TAX_BRACKETS_2024[filingStatus];
const standardDeduction = ANNUAL_STANDARD_DEDUCTION_2024[filingStatus];
const ssWageCap = SOCIAL_SECURITY_WAGE_CAP_2024;
```

**Proposed Fix**:
```typescript
import { loadFederalConfig } from './config/taxConfigLoader.js';

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  // Determine tax year from pay period
  const taxYear = new Date().getFullYear(); // Or from input.payDate if available

  // Load configuration for tax year
  const config = loadFederalConfig(taxYear);

  // Use config values instead of hardcoded constants
  const brackets = config.federalWithholding[filingStatus]?.brackets
    || config.federalWithholding.SINGLE.brackets;

  const standardDeduction = config.federalWithholding[filingStatus]?.standardDeduction
    || config.federalWithholding.SINGLE.standardDeduction;

  const ssWageCap = config.fica.socialSecurityWageCap;
  const ssRate = config.fica.socialSecurityRate;
  const medicareRate = config.fica.medicareRate;
  const additionalMedicareRate = config.fica.additionalMedicareRate;
  const additionalMedicareThreshold = config.fica.additionalMedicareThreshold;

  // Rest of calculation uses config values
  // ...
}
```

### Step 3: Pass Tax Year to Tax Calculators

**Update PayrollCalculator**:
```typescript
// In PayrollCalculator.calculate()
const taxYear = getTaxYear(new Date(payPeriodEnd));

const federalTax = calculateFederalTax({
  grossPay: earnings.grossPay,
  annualIncome: estimatedAnnualIncome,
  filingStatus: employee.filingStatus,
  // ... other params
  taxYear  // NEW: Pass tax year
});
```

### Step 4: Update Tax Calculator Interfaces

```typescript
export interface FederalTaxInput {
  // ... existing fields
  taxYear?: number;  // NEW: Optional, defaults to current year
}

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const taxYear = input.taxYear || new Date().getFullYear();
  const config = loadFederalConfig(taxYear);
  // ...
}
```

---

## State Tax Calculators

**Same Issue**: State tax files also have hardcoded 2024 values.

**Example (california.ts)**:
```typescript
// ❌ Hardcoded 2024
const CA_TAX_BRACKETS_2024 = { ... };
const CA_SDI_RATE_2024 = 0.009;
const CA_SDI_WAGE_CAP_2024 = 153164;
```

**Solution**: Each state calculator needs to:
1. Accept `taxYear` parameter
2. Call `loadStateConfig(state, taxYear)`
3. Use config values instead of hardcoded constants

**Config Files Available**:
```bash
server/src/tax/config/states/
  california-2024.json
  california-2025.json
  newyork-2024.json
  # ... etc
```

---

## Implementation Plan

### Phase 1: Federal Tax (Highest Priority)

**Files to Modify**:
1. `server/src/tax/federal.ts`
   - Add `taxYear` parameter to `FederalTaxInput`
   - Import and use `loadFederalConfig()`
   - Replace all hardcoded 2024 constants with config values

2. `server/src/services/payrollCalculator.ts`
   - Determine tax year from `payPeriodEnd`
   - Pass `taxYear` to `calculateFederalTax()`

**Changes**:
```typescript
// federal.ts
import { loadFederalConfig } from './config/taxConfigLoader.js';

export interface FederalTaxInput {
  grossPay: number;
  preTaxDeductions?: number;
  annualIncome: number;
  filingStatus: string;
  allowances: number;
  additionalWithholding: number;
  otherIncome?: number;
  deductions?: number;
  payPeriodsPerYear: number;
  ytdGrossWages?: number;
  taxYear?: number;  // NEW
}

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const taxYear = input.taxYear || new Date().getFullYear();
  const config = loadFederalConfig(taxYear);

  // Replace all TAX_BRACKETS_2024 with config.federalWithholding[filingStatus].brackets
  // Replace all ANNUAL_STANDARD_DEDUCTION_2024 with config.federalWithholding[filingStatus].standardDeduction
  // Replace all SOCIAL_SECURITY_* constants with config.fica.*
  // Replace MEDICARE_* constants with config.fica.*
  // Replace DEPENDENT_CREDIT with config.dependentCredit
}
```

### Phase 2: State Tax (Medium Priority)

**For Each State Calculator**:
1. Add `taxYear` parameter
2. Call `loadStateConfig(state, taxYear)`
3. Use config values

**Example (california.ts)**:
```typescript
import { loadStateConfig } from './config/taxConfigLoader.js';

export function calculateCaliforniaTax(input: StateTaxInput): StateTaxResult {
  const taxYear = input.taxYear || new Date().getFullYear();
  const config = loadStateConfig('CA', taxYear);

  if (!config) {
    throw new Error(`California tax config not found for year ${taxYear}`);
  }

  const brackets = config.brackets?.[input.filingStatus]
    || config.brackets?.SINGLE;

  const sdiRate = config.sdi?.rate || 0;
  const sdiWageCap = config.sdi?.wageCap || 0;

  // ... use config values
}
```

### Phase 3: Employer Tax (Lower Priority)

**Files**:
- `server/src/tax/employerTax.ts`

**Use `loadFederalConfig()` for**:
- FUTA rate and wage cap
- FICA employer match rates

### Phase 4: Form 941/940 Tax Liability

**Files**:
- `server/src/routes/taxLiability.ts`

**Update**:
- Use `loadFederalConfig(query.year)` instead of hardcoded constants
- Already partially done (we just added SS wage cap constant)

---

## Config File Management

### Adding New Tax Year

**Steps**:
1. Copy previous year's config:
   ```bash
   cp server/src/tax/config/federal-2025.json \
      server/src/tax/config/federal-2026.json
   ```

2. Update values from IRS announcements:
   - Social Security wage cap (usually announced in October)
   - Standard deductions (IRS Revenue Procedure)
   - Tax brackets (IRS Revenue Procedure)
   - FUTA wage cap (usually unchanged at $7,000)

3. Validate JSON:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('federal-2026.json'))"
   ```

4. Restart server (config loader has caching)

### IRS Announcement Sources

**Annual Updates**:
- **Revenue Procedure** (usually released in October/November)
  - Example: Rev. Proc. 2024-40 for 2025
  - Contains inflation adjustments for:
    - Tax brackets
    - Standard deductions
    - AMT exemptions
    - Earned Income Credit
    - Child Tax Credit

- **Social Security Administration** (usually October)
  - Social Security wage base (FICA cap)
  - Example: 2025 wage base is $176,100

- **Form W-4 Updates** (usually December)
  - Withholding tables
  - Percentage method adjustments

**Monitoring**:
- IRS.gov announcements
- SSA.gov cost-of-living adjustments
- Set calendar reminder for October each year

---

## Testing

### Test Case 1: 2024 Payroll (Existing)
```typescript
const result = calculateFederalTax({
  grossPay: 5000,
  annualIncome: 130000,
  filingStatus: 'SINGLE',
  taxYear: 2024,
  // ...
});

// Should use 2024 config
expect(ssWageCap).toBe(168600);
expect(standardDeduction).toBe(14600);
```

### Test Case 2: 2025 Payroll (NEW)
```typescript
const result = calculateFederalTax({
  grossPay: 5000,
  annualIncome: 130000,
  filingStatus: 'SINGLE',
  taxYear: 2025,
  // ...
});

// Should use 2025 config
expect(ssWageCap).toBe(176100);
expect(standardDeduction).toBe(15000);
```

### Test Case 3: Automatic Year Detection
```typescript
// Pay date in 2025
const payPeriodEnd = new Date('2025-01-15');
const taxYear = getTaxYear(payPeriodEnd);

const result = calculateFederalTax({
  grossPay: 5000,
  annualIncome: 130000,
  filingStatus: 'SINGLE',
  taxYear,  // Should be 2025
  // ...
});

expect(taxYear).toBe(2025);
```

### Test Case 4: Fallback to Most Recent Year
```typescript
// Request future year that doesn't exist yet
const result = calculateFederalTax({
  grossPay: 5000,
  taxYear: 2030,  // Config doesn't exist
  // ...
});

// Should fall back to 2025 (most recent available)
// Console warning: "Federal tax config for 2030 not found, using 2025"
```

### Test Case 5: Missing Config File
```typescript
// Delete all config files
expect(() => {
  calculateFederalTax({ taxYear: 2024, /* ... */ });
}).toThrow('No federal tax configuration available');
```

---

## Migration Strategy

### Option A: Big Bang (Not Recommended)
- Update all tax calculators at once
- Higher risk
- Harder to test

### Option B: Gradual Rollout (Recommended)

**Week 1: Federal Tax**
- Update `federal.ts` to use config loader
- Add `taxYear` parameter
- Test thoroughly
- Deploy

**Week 2: California (Pilot State)**
- Update `california.ts` to use config loader
- Test with real 2024 and 2025 data
- Deploy

**Week 3-4: Remaining States**
- Update all other state calculators
- Batch by region or alphabetically
- Test and deploy incrementally

**Week 5: Employer Tax**
- Update `employerTax.ts`
- Final integration testing

**Week 6: Tax Liability Reports**
- Update Form 941/940 endpoints
- End-to-end testing

### Backwards Compatibility

**Ensure old code still works**:
```typescript
// Old code (no taxYear parameter)
calculateFederalTax({
  grossPay: 5000,
  // ... no taxYear
});
// Should default to current year (2025 in 2025, etc.)

// New code (explicit taxYear)
calculateFederalTax({
  grossPay: 5000,
  taxYear: 2024  // Explicit
});
```

---

## Performance Considerations

### Config Caching

The config loader already implements caching:
```typescript
const federalConfigCache = new Map<number, FederalTaxConfig>();
```

**First Call**:
```
loadFederalConfig(2025)
  -> Read file: federal-2025.json
  -> Parse JSON
  -> Cache in Map
  -> Return config
```

**Subsequent Calls**:
```
loadFederalConfig(2025)
  -> Check cache
  -> Return cached config (no I/O)
```

**Impact**: Negligible performance impact after first load.

### Memory Usage

**Per Tax Year**: ~2-5 KB (JSON config)
**Typical Scenario**: 2-3 years cached simultaneously
**Total Memory**: <15 KB

**Conclusion**: Memory impact is negligible.

---

## Compliance Timeline

### Critical Dates

**December 31, 2024 at 11:59:59 PM**:
- Last payroll using 2024 tax tables

**January 1, 2025 at 12:00:00 AM**:
- First payroll using 2025 tax tables
- **MUST BE FIXED BY THIS DATE**

**Current Status**: December/January 2025
- **URGENT**: System currently uses 2024 tables for all payrolls
- Any January 2025 payroll is already incorrect!

### Remediation Steps

**Immediate (This Week)**:
1. ✅ Document issue (this file)
2. ⏳ Implement federal tax config loading
3. ⏳ Test with 2024 and 2025 configs
4. ⏳ Deploy to production

**Short-term (Next Week)**:
1. ⏳ Update state tax calculators
2. ⏳ Full integration testing
3. ⏳ Deploy state tax updates

**Medium-term (This Month)**:
1. ⏳ Add automated tests for year transitions
2. ⏳ Document config file update process
3. ⏳ Set up monitoring/alerts

**Long-term**:
1. ⏳ Annual tax config update procedure
2. ⏳ Automated IRS announcement tracking
3. ⏳ Config validation tool

---

## Summary

| Aspect | Current State | Target State | Priority |
|--------|---------------|--------------|----------|
| **Federal Tax** | ❌ Hardcoded 2024 | ✅ Dynamic loading | CRITICAL |
| **State Tax** | ❌ Hardcoded 2024 | ✅ Dynamic loading | HIGH |
| **Employer Tax** | ❌ Hardcoded 2024 | ✅ Dynamic loading | MEDIUM |
| **Config Loader** | ✅ Exists, unused | ✅ In use | - |
| **2025 Configs** | ✅ Exist | ✅ Being used | - |
| **Compliance** | ❌ At risk | ✅ Compliant | CRITICAL |

**Recommendation**: Implement federal tax config loading immediately. This is a compliance-critical issue that affects all 2025 payrolls.

---

## Files to Modify

1. `server/src/tax/federal.ts` - Use config loader ⚠️ CRITICAL
2. `server/src/tax/federalDecimal.ts` - Use config loader (if exists)
3. `server/src/tax/state/california.ts` - Use config loader
4. `server/src/tax/state/*.ts` - Use config loader (all 42 states)
5. `server/src/tax/employerTax.ts` - Use config loader
6. `server/src/services/payrollCalculator.ts` - Pass taxYear parameter
7. `server/src/routes/taxLiability.ts` - Use config for Form 941/940

## Files Already Correct

- ✅ `server/src/tax/config/taxConfigLoader.ts` - Fully implemented
- ✅ `server/src/tax/config/federal-2024.json` - 2024 config exists
- ✅ `server/src/tax/config/federal-2025.json` - 2025 config exists
- ✅ `server/src/tax/config/states/*.json` - State configs exist
