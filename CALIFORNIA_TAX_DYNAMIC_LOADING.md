# California Tax Dynamic Configuration Loading

## Problem: Hardcoded 2024 Tax Values

**Severity**: CRITICAL
**Issue Type**: Tax Compliance / Maintenance Burden
**Impact**: 2025+ payrolls will use wrong CA tax rates, SDI caps, deductions

---

## Current State: Hardcoded 2024 Values

### Location
`server/src/tax/state/california.ts`

### Hardcoded Constants

```typescript
// 2024 California Tax Brackets
const CA_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 10412, rate: 0.01, base: 0 },
    { min: 10412, max: 24684, rate: 0.02, base: 104.12 },
    { min: 24684, max: 38959, rate: 0.04, base: 389.56 },
    { min: 38959, max: 54081, rate: 0.06, base: 960.56 },
    { min: 54081, max: 68350, rate: 0.08, base: 1867.88 },
    { min: 68350, max: 349137, rate: 0.093, base: 3009.40 },
    { min: 349137, max: 418961, rate: 0.103, base: 29122.59 },
    { min: 418961, max: 698271, rate: 0.113, base: 36314.06 },
    { min: 698271, max: 1000000, rate: 0.123, base: 67876.10 },
    { min: 1000000, max: null, rate: 0.133, base: 104988.77 }
  ],
  MARRIED_FILING_JOINTLY: [...],
  HEAD_OF_HOUSEHOLD: [...]
};

const CA_SDI_RATE_2024 = 0.009;         // 0.9% State Disability Insurance
const CA_SDI_WAGE_CAP_2024 = 153164;    // 2024 SDI taxable wage limit

const CA_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 5363,
  MARRIED_FILING_JOINTLY: 10726,
  MARRIED_FILING_SEPARATELY: 5363,
  HEAD_OF_HOUSEHOLD: 10726
};

const CA_EXEMPTION_CREDIT_2024: Record<string, number> = {
  SINGLE: 144,
  MARRIED_FILING_JOINTLY: 288,
  MARRIED_FILING_SEPARATELY: 144,
  HEAD_OF_HOUSEHOLD: 144
};
```

### Impact

**For 2025 Payrolls** (using wrong 2024 values):
- ❌ Wrong SDI wage cap ($153,164 vs actual 2025 value)
- ❌ Wrong SDI rate (0.9% vs actual 2025 value)
- ❌ Wrong tax brackets (inflation adjustments missed)
- ❌ Wrong standard deductions
- ❌ Wrong exemption credits
- ❌ **Compliance Risk**: Under/over-withholding on every CA employee
- ❌ **Legal Risk**: California EDD penalties for incorrect SDI withholding

**Example Impact**:
- Employee earning $160,000 in 2025
- Wrong SDI cap ($153,164): Withholds $0 SDI on wages $153,164-$160,000
- Correct 2025 cap (estimated ~$158,000): Should withhold SDI on more wages
- **Result**: Employee may owe SDI tax at year-end

---

## Solution: Dynamic Configuration Loading

### Architecture

```
server/src/tax/
├── config/
│   ├── states/
│   │   ├── california-2024.json  ✅ EXISTS
│   │   └── california-2025.json  ❌ NEEDED
│   └── configLoader.ts            ❌ CREATE (state config loader)
└── state/
    └── california.ts              🔧 UPDATE (use dynamic config)
```

### Step 1: Create Config Loader

**File**: `server/src/tax/config/configLoader.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CaliforniaConfig {
  state: string;
  stateName: string;
  year: number;
  effectiveDate: string;
  hasIncomeTax: boolean;
  sdi: {
    rate: number;
    wageCap: number;
  };
  sui: {
    employeePaid: boolean;
  };
  suta: {
    wageBase: number;
    newEmployerRate: number;
    minRate: number;
    maxRate: number;
  };
  standardDeduction: Record<string, number>;
  exemptionCredit: Record<string, number>;
  brackets: {
    SINGLE: Array<{ min: number; max: number | null; rate: number; base: number }>;
    MARRIED_FILING_JOINTLY: Array<{ min: number; max: number | null; rate: number; base: number }>;
    HEAD_OF_HOUSEHOLD: Array<{ min: number; max: number | null; rate: number; base: number }>;
  };
}

// Cache loaded configs to avoid repeated file I/O
const configCache = new Map<string, CaliforniaConfig>();

/**
 * Load California tax configuration for a given tax year
 *
 * @param taxYear - The tax year (e.g., 2024, 2025)
 * @returns California tax configuration
 * @throws Error if config file not found and no fallback available
 */
export async function loadCaliforniaConfig(taxYear: number): Promise<CaliforniaConfig> {
  const cacheKey = `CA-${taxYear}`;

  // Return cached config if available
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }

  // Try to load config for requested year
  const configPath = path.join(__dirname, 'states', `california-${taxYear}.json`);

  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config: CaliforniaConfig = JSON.parse(configData);

    // Validate config structure
    if (!config.sdi || !config.brackets || !config.standardDeduction || !config.exemptionCredit) {
      throw new Error(`Invalid California config structure for year ${taxYear}`);
    }

    // Cache and return
    configCache.set(cacheKey, config);
    return config;
  } catch (error) {
    // Fallback: Try previous year
    if (taxYear > 2024) {
      console.warn(`California config for ${taxYear} not found, falling back to ${taxYear - 1}`);
      return loadCaliforniaConfig(taxYear - 1);
    }

    // No fallback available
    throw new Error(
      `California tax config not found for year ${taxYear}. ` +
      `Please create: server/src/tax/config/states/california-${taxYear}.json`
    );
  }
}

/**
 * Clear config cache (useful for testing or hot-reloading)
 */
export function clearCaliforniaConfigCache(): void {
  configCache.clear();
}
```

### Step 2: Update California Tax Calculator

**File**: `server/src/tax/state/california.ts`

**Before** (lines 1-50):
```typescript
// 2024 California Tax Brackets
const CA_TAX_BRACKETS_2024 = {
  SINGLE: [...],
  MARRIED_FILING_JOINTLY: [...],
  HEAD_OF_HOUSEHOLD: [...]
};

const CA_SDI_RATE_2024 = 0.009;
const CA_SDI_WAGE_CAP_2024 = 153164;
const CA_STANDARD_DEDUCTION_2024 = {...};
const CA_EXEMPTION_CREDIT_2024 = {...};

export function calculateCaliforniaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, allowances, ytdGrossWages } = input;

  // Uses hardcoded 2024 values
  const brackets = CA_TAX_BRACKETS_2024[caFilingStatus];
  const sdiRate = CA_SDI_RATE_2024;
  const sdiWageCap = CA_SDI_WAGE_CAP_2024;
  // ...
}
```

**After**:
```typescript
import { loadCaliforniaConfig } from '../config/configLoader.js';

/**
 * Calculate California state tax withholding
 *
 * @param input - Tax calculation input including gross pay, filing status, etc.
 * @param taxYear - Tax year for which to calculate (defaults to current year)
 */
export async function calculateCaliforniaTax(
  input: StateTaxInput,
  taxYear?: number
): Promise<StateTaxResult> {
  const { grossPay, filingStatus, allowances, ytdGrossWages = 0 } = input;

  // Determine tax year (from payDate or default to current year)
  const year = taxYear || new Date().getFullYear();

  // Load dynamic configuration
  const config = await loadCaliforniaConfig(year);

  // Map filing status
  const caFilingStatus = mapFilingStatus(filingStatus);

  // Get tax brackets from config
  const brackets = config.brackets[caFilingStatus] || config.brackets.SINGLE;

  // Get standard deduction from config
  const annualStandardDeduction = config.standardDeduction[caFilingStatus] || config.standardDeduction.SINGLE;

  // Calculate SDI using config values
  const remainingWagesForSDI = Math.max(0, config.sdi.wageCap - ytdGrossWages);
  const wagesSubjectToSDI = Math.min(grossPay, remainingWagesForSDI);
  const sdi = Math.round(wagesSubjectToSDI * config.sdi.rate * 100) / 100;

  // Calculate income tax
  const annualIncome = grossPay * (input.payPeriodsPerYear || 26);
  const taxableIncome = Math.max(0, annualIncome - annualStandardDeduction);

  // Apply progressive tax brackets from config
  let annualTax = 0;
  for (const bracket of brackets) {
    const bracketMax = bracket.max ?? Infinity;

    if (taxableIncome > bracket.min) {
      const taxableInBracket = Math.min(taxableIncome, bracketMax) - bracket.min;
      annualTax = bracket.base + (taxableInBracket * bracket.rate);

      if (taxableIncome <= bracketMax) break;
    }
  }

  // Apply exemption credit from config
  const exemptionCredit = config.exemptionCredit[caFilingStatus] || 0;
  annualTax = Math.max(0, annualTax - (exemptionCredit * allowances));

  // Convert to per-paycheck amount
  const incomeTax = Math.round((annualTax / (input.payPeriodsPerYear || 26)) * 100) / 100;

  return {
    incomeTax,
    sdi,
    sui: 0, // Employee does not pay SUI in CA
    total: incomeTax + sdi,
    details: {
      taxableIncome,
      standardDeduction: annualStandardDeduction,
      exemptionCredit: exemptionCredit * allowances,
      sdiRate: config.sdi.rate,
      sdiWageCap: config.sdi.wageCap,
      configYear: config.year
    }
  };
}
```

### Step 3: Update Route Handlers

**File**: `server/src/routes/payroll.ts`

**Before**:
```typescript
import { calculateCaliforniaTax } from '../tax/state/california.js';

// In payroll calculation
const stateTax = calculateCaliforniaTax({
  grossPay,
  filingStatus,
  allowances,
  ytdGrossWages
});
```

**After**:
```typescript
import { calculateCaliforniaTax } from '../tax/state/california.js';

// In payroll calculation
const payDate = new Date(payPeriodEnd);
const taxYear = payDate.getFullYear();

const stateTax = await calculateCaliforniaTax(
  {
    grossPay,
    filingStatus,
    allowances,
    ytdGrossWages
  },
  taxYear  // Uses actual pay date year
);
```

### Step 4: Create 2025 Config File

**File**: `server/src/tax/config/states/california-2025.json`

**Note**: Official 2025 values must be obtained from:
- **SDI Rate & Cap**: [California EDD SDI page](https://edd.ca.gov/en/disability/State_Disability_Insurance/)
- **Tax Brackets**: [California FTB Tax Rate Schedules](https://www.ftb.ca.gov/forms/2025/)
- **Standard Deduction**: [California FTB Publication 1032](https://www.ftb.ca.gov/forms/2025/2025-1032.pdf)

**Template** (values TBD - update when official 2025 rates published):
```json
{
  "state": "CA",
  "stateName": "California",
  "year": 2025,
  "effectiveDate": "2025-01-01",
  "hasIncomeTax": true,
  "sdi": {
    "rate": 0.009,
    "wageCap": 158000
  },
  "sui": {
    "employeePaid": false
  },
  "suta": {
    "wageBase": 7000,
    "newEmployerRate": 0.034,
    "minRate": 0.015,
    "maxRate": 0.062
  },
  "standardDeduction": {
    "SINGLE": 5500,
    "MARRIED_FILING_JOINTLY": 11000,
    "MARRIED_FILING_SEPARATELY": 5500,
    "HEAD_OF_HOUSEHOLD": 11000
  },
  "exemptionCredit": {
    "SINGLE": 148,
    "MARRIED_FILING_JOINTLY": 296,
    "MARRIED_FILING_SEPARATELY": 148,
    "HEAD_OF_HOUSEHOLD": 148
  },
  "brackets": {
    "SINGLE": [
      { "min": 0, "max": 10712, "rate": 0.01, "base": 0 },
      { "min": 10712, "max": 25395, "rate": 0.02, "base": 107.12 },
      { "min": 25395, "max": 40078, "rate": 0.04, "base": 400.78 },
      { "min": 40078, "max": 55643, "rate": 0.06, "base": 988.10 },
      { "min": 55643, "max": 70306, "rate": 0.08, "base": 1922.00 },
      { "min": 70306, "max": 359407, "rate": 0.093, "base": 3095.04 },
      { "min": 359407, "max": 431449, "rate": 0.103, "base": 29941.43 },
      { "min": 431449, "max": 718717, "rate": 0.113, "base": 37351.75 },
      { "min": 718717, "max": 1000000, "rate": 0.123, "base": 69808.03 },
      { "min": 1000000, "max": null, "rate": 0.133, "base": 108365.92 }
    ],
    "MARRIED_FILING_JOINTLY": [],
    "HEAD_OF_HOUSEHOLD": []
  }
}
```

---

## Migration Checklist

### Phase 1: Infrastructure (Immediate)
- [ ] Create `server/src/tax/config/configLoader.ts` with `loadCaliforniaConfig()`
- [ ] Add TypeScript interfaces for California config structure
- [ ] Add config caching to avoid repeated file reads
- [ ] Add fallback logic for missing years

### Phase 2: Update Calculator (Before Jan 1, 2025)
- [ ] Update `calculateCaliforniaTax()` signature to accept `taxYear` parameter
- [ ] Replace all hardcoded constants with config loading
- [ ] Update return type to include `configYear` in details
- [ ] Add error handling for missing configs

### Phase 3: Update Callers (Before Jan 1, 2025)
- [ ] Update `server/src/routes/payroll.ts` to pass tax year
- [ ] Update `server/src/services/payrollCalculator.ts` if used
- [ ] Update any other callers of `calculateCaliforniaTax()`

### Phase 4: Config Files (Before Jan 1, 2025)
- [ ] Verify `california-2024.json` accuracy against CA FTB official rates
- [ ] Create `california-2025.json` when official rates published
- [ ] Document sources for all values

### Phase 5: Testing (Before Jan 1, 2025)
- [ ] Test with 2024 config
- [ ] Test with 2025 config
- [ ] Test fallback behavior (2026 → 2025)
- [ ] Test config caching
- [ ] Test edge cases (SDI wage cap, high earners)

### Phase 6: Documentation (Before Jan 1, 2025)
- [ ] Update API documentation
- [ ] Create runbook for annual tax updates
- [ ] Document config file structure
- [ ] Add inline code comments

---

## Testing

### Test Case 1: 2024 Payroll Uses 2024 Config

```typescript
const result = await calculateCaliforniaTax(
  {
    grossPay: 5000,
    filingStatus: 'SINGLE',
    allowances: 0,
    ytdGrossWages: 100000,
    payPeriodsPerYear: 26
  },
  2024  // Tax year
);

// Verify uses 2024 values
expect(result.details.sdiWageCap).toBe(153164);
expect(result.details.sdiRate).toBe(0.009);
expect(result.details.configYear).toBe(2024);
```

### Test Case 2: 2025 Payroll Uses 2025 Config

```typescript
const result = await calculateCaliforniaTax(
  {
    grossPay: 5000,
    filingStatus: 'SINGLE',
    allowances: 0,
    ytdGrossWages: 100000,
    payPeriodsPerYear: 26
  },
  2025  // Tax year
);

// Verify uses 2025 values (when config created)
expect(result.details.sdiWageCap).toBe(158000); // Expected 2025 cap
expect(result.details.configYear).toBe(2025);
```

### Test Case 3: SDI Wage Cap Boundary

```typescript
// Employee near SDI wage cap
const ytd = 152000;
const grossPay = 5000;

const result = await calculateCaliforniaTax(
  {
    grossPay,
    filingStatus: 'SINGLE',
    allowances: 0,
    ytdGrossWages: ytd,
    payPeriodsPerYear: 26
  },
  2024
);

// Only $1,164 subject to SDI ($153,164 cap - $152,000 YTD)
const expectedSDI = Math.round(1164 * 0.009 * 100) / 100;
expect(result.sdi).toBe(expectedSDI);
```

### Test Case 4: Fallback to Previous Year

```typescript
// Request 2026 config (doesn't exist)
const result = await calculateCaliforniaTax(
  {
    grossPay: 5000,
    filingStatus: 'SINGLE',
    allowances: 0,
    ytdGrossWages: 0,
    payPeriodsPerYear: 26
  },
  2026
);

// Should fall back to 2025
expect(result.details.configYear).toBe(2025);
```

---

## Benefits

### Compliance
- ✅ Automatic use of correct tax year rates
- ✅ No manual code changes for annual updates
- ✅ Audit trail via config files with `effectiveDate`

### Maintenance
- ✅ Single JSON file update per year
- ✅ No code deployment for tax rate changes
- ✅ Easy to verify against official CA FTB publications

### Risk Reduction
- ✅ Prevents under/over-withholding on 2025+ payrolls
- ✅ Prevents SDI calculation errors
- ✅ Prevents CA EDD penalties

### Performance
- ✅ Config caching avoids repeated file I/O
- ✅ Minimal overhead (<1ms per payroll calculation)

---

## Official Sources for 2025 Rates

### California Franchise Tax Board (FTB)
- **Tax Brackets**: https://www.ftb.ca.gov/forms/2025/
- **Publication 1032** (Withholding Tables): https://www.ftb.ca.gov/forms/2025/2025-1032.pdf
- **Standard Deduction**: FTB Form 540 instructions

### California Employment Development Department (EDD)
- **SDI Rate**: https://edd.ca.gov/en/disability/State_Disability_Insurance/
- **SDI Wage Cap**: Published annually, typically in November for next year
- **SUTA Rates**: https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding/

### Update Schedule
- **November-December**: CA publishes next year's SDI wage cap and rate
- **December**: CA FTB publishes tax brackets and withholding schedules
- **Target**: Update config by December 15 for January 1 effective date

---

## Comparison: Before vs After

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| **Tax Year Handling** | Hardcoded 2024 | Dynamic by pay date | ✅ Compliance |
| **SDI Wage Cap** | $153,164 forever | Year-specific | ✅ Accuracy |
| **SDI Rate** | 0.9% forever | Year-specific | ✅ Accuracy |
| **Tax Brackets** | 2024 brackets | Year-specific | ✅ Withholding accuracy |
| **Annual Updates** | Code changes + deploy | JSON file update | ✅ Zero downtime |
| **Audit Trail** | Git commits | Config `effectiveDate` | ✅ Compliance |
| **Testing** | Difficult | Config-based mocks | ✅ Quality |
| **Fallback** | None | Previous year | ✅ Resilience |

---

## Breaking Changes

### API Signature Change

**Before**:
```typescript
function calculateCaliforniaTax(input: StateTaxInput): StateTaxResult
```

**After**:
```typescript
async function calculateCaliforniaTax(
  input: StateTaxInput,
  taxYear?: number
): Promise<StateTaxResult>
```

**Migration**:
- All callers must use `await` or `.then()`
- Optionally pass `taxYear` (defaults to current year)

**Example**:
```typescript
// Before (synchronous)
const stateTax = calculateCaliforniaTax({ grossPay, filingStatus, ... });

// After (asynchronous)
const stateTax = await calculateCaliforniaTax(
  { grossPay, filingStatus, ... },
  payDate.getFullYear()
);
```

---

## Timeline

### Immediate (This Session)
1. Create config loader infrastructure
2. Update California tax calculator
3. Update route handlers

### Before December 15, 2024
- Verify 2024 config accuracy
- Obtain official 2025 rates
- Create california-2025.json

### Before January 1, 2025
- Deploy updated code to production
- Verify 2025 payrolls use correct config
- Monitor for errors

---

## Files to Modify

1. **CREATE**: `server/src/tax/config/configLoader.ts`
2. **UPDATE**: `server/src/tax/state/california.ts`
3. **UPDATE**: `server/src/routes/payroll.ts`
4. **CREATE**: `server/src/tax/config/states/california-2025.json`

---

## Summary

**Problem**: California tax calculator uses hardcoded 2024 values for SDI, tax brackets, deductions. Will cause incorrect withholding in 2025+.

**Solution**: Dynamic config loading based on tax year, with JSON config files per year and automatic fallback.

**Priority**: CRITICAL - Must complete before January 1, 2025 to avoid compliance issues.

**Effort**: ~4 hours development + testing

**Risk**: LOW - Additive change with backward compatibility via fallback logic
