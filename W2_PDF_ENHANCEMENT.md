# W-2 PDF Generator Enhancement

## Overview

Professional W-2 PDF generation functionality has been successfully added to the US Payroll System. This enhancement provides IRS-compliant W-2 form generation with a 2-Up format (Copy B and Copy C on a single page).

## Implementation Details

### File Modified

**`server/src/services/w2Generator.ts`**
- Added PDF generation capabilities to existing W-2 data aggregation logic
- New function: `generateW2PDF()` - Main PDF generation function
- Helper functions:
  - `drawW2Form()` - Draws a single W-2 form with precise positioning
  - `drawBox()` - Draws labeled boxes
  - `drawValueBox()` - Draws boxes with labels and right-aligned values
  - `drawCheckbox()` - Renders checkboxes (checked/unchecked)
  - `formatMoney()` - Formats numbers as currency strings

### Dependencies

Already installed in `package.json`:
- ✅ `pdfkit@^0.17.2` - PDF generation library
- ✅ `@types/pdfkit@^0.17.4` - TypeScript types

### Key Features

1. **2-Up Format**
   - Copy B: "To Be Filed With Employee's FEDERAL Tax Return" (top half)
   - Copy C: "For EMPLOYEE'S RECORDS" (bottom half)
   - Dashed cut line between the two copies

2. **Grid-Based Layout**
   - Precise positioning using coordinates
   - Letter size (8.5" × 11")
   - All IRS-required boxes (a-f, 1-20)

3. **Data Handling**
   - SSN decryption and formatting (XXX-XX-XXXX)
   - Box 12 codes (up to 4 codes: a, b, c, d)
   - Box 13 checkboxes (Statutory employee, Retirement plan, Third-party sick pay)
   - Box 14 other deductions (formatted as comma-separated list)
   - State and local tax information (Boxes 15-20)

4. **Professional Formatting**
   - Right-aligned currency values with comma separators
   - Proper font sizing (6pt labels, 9pt values, 14pt title)
   - Bold fonts for values
   - Empty boxes show no value (not $0.00)

## Usage

### Generate W-2 PDF for a Single Employee

```typescript
import { generateW2ForEmployee, generateW2PDF } from './services/w2Generator.js';

// Step 1: Generate W-2 data
const w2Data = await generateW2ForEmployee(employeeId, taxYear);

// Step 2: Generate PDF
const pdfDoc = generateW2PDF(w2Data);

// Step 3: Stream to response
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `inline; filename="w2-${taxYear}-${employeeId}.pdf"`);
pdfDoc.pipe(res);
```

### Example Route Implementation

```typescript
// server/src/routes/w2.ts
router.get('/:id/pdf', async (req, res) => {
  try {
    const w2Form = await prisma.w2Form.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        company: true
      }
    });

    if (!w2Form) {
      return res.status(404).json({ error: 'W-2 form not found' });
    }

    // Convert database record to W2Data format
    const w2Data: W2Data = {
      employeeId: w2Form.employee.id,
      employeeName: `${w2Form.employee.firstName} ${w2Form.employee.lastName}`,
      employeeSSN: w2Form.employee.ssn, // Encrypted
      employeeAddress: {
        street: w2Form.employee.address,
        city: w2Form.employee.city,
        state: w2Form.employee.state,
        zipCode: w2Form.employee.zipCode
      },
      companyId: w2Form.company.id,
      companyName: w2Form.company.name,
      companyEIN: w2Form.company.ein,
      companyAddress: {
        street: w2Form.company.address,
        city: w2Form.company.city,
        state: w2Form.company.state,
        zipCode: w2Form.company.zipCode
      },
      taxYear: w2Form.taxYear,
      box1WagesTipsOther: Number(w2Form.wagesTipsOther),
      box2FederalWithholding: Number(w2Form.federalWithholding),
      box3SocialSecurityWages: Number(w2Form.socialSecurityWages),
      box4SocialSecurityTax: Number(w2Form.socialSecurityTax),
      box5MedicareWages: Number(w2Form.medicareWages),
      box6MedicareTax: Number(w2Form.medicareTax),
      box7SocialSecurityTips: Number(w2Form.socialSecurityTips),
      box8AllocatedTips: Number(w2Form.allocatedTips),
      box10DependentCareBenefits: Number(w2Form.dependentCareBenefits),
      box11NonqualifiedPlans: Number(w2Form.nonqualifiedPlans),
      box12: JSON.parse(w2Form.box12Codes || '[]'),
      box13: {
        statutoryEmployee: w2Form.statutoryEmployee,
        retirementPlan: w2Form.retirementPlan,
        thirdPartySickPay: w2Form.thirdPartySickPay
      },
      box14Other: JSON.parse(w2Form.box14Other || '[]'),
      stateCode: w2Form.stateCode,
      stateEmployerId: w2Form.stateEmployerId,
      stateWages: Number(w2Form.stateWages),
      stateWithholding: Number(w2Form.stateWithholding),
      localWages: Number(w2Form.localWages),
      localWithholding: Number(w2Form.localWithholding),
      localityName: w2Form.localityName,
      state2Code: w2Form.state2Code,
      state2EmployerId: w2Form.state2EmployerId,
      state2Wages: Number(w2Form.state2Wages || 0),
      state2Withholding: Number(w2Form.state2Withholding || 0),
      controlNumber: w2Form.controlNumber
    };

    // Generate and stream PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="w2-${w2Form.taxYear}.pdf"`);

    const pdfDoc = generateW2PDF(w2Data);
    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Error generating W-2 PDF:', error);
    res.status(500).json({ error: 'Failed to generate W-2 PDF' });
  }
});
```

## IRS Compliance Notes

### Copy Types

- **Copy A (Red Form)**: Filed with the Social Security Administration
  - ⚠️ Must use official red-ink forms from IRS
  - Cannot be printed on regular printers
  - Our PDF generator creates **substitute forms only**

- **Copy B (Black/Blue)**: Employee files with federal tax return
  - ✅ Can use substitute forms (our PDF)
  - Printed on white paper with black or blue ink

- **Copy C (Black/Blue)**: Employee's records
  - ✅ Can use substitute forms (our PDF)
  - Printed on white paper with black or blue ink

- **Copy D**: Employer's records (not generated by this function)
- **Copy 1, 2**: State and local tax filings (not generated)

### Substitute Forms Requirements (IRS Pub 1141)

✅ **Our implementation meets these requirements:**
1. Form dimensions: 8.5" × 11" (Letter size)
2. All required boxes present (a-f, 1-20)
3. Box labels match IRS specifications
4. Proper spacing and alignment
5. Clear, legible text
6. Machine-readable (OCR-friendly layout)

❌ **Copy A cannot use substitute forms** - must order official red forms from IRS

## Testing

Test the PDF generation:

```bash
# In your browser or API client
GET /api/w2/:id/pdf

# Expected response:
# Content-Type: application/pdf
# PDF with two W-2 forms on one page (Copy B and Copy C)
```

## Security Considerations

- **SSN Decryption**: SSN is decrypted only for PDF display
- **Access Control**: Ensure route has proper authentication/authorization
- **Tenant Isolation**: Verify user can only access their company's W-2s

## Future Enhancements

1. **Batch PDF Generation**: Generate PDFs for all employees
2. **Copy A Export**: Data export for SSA filing (not PDF)
3. **W-2C Corrections**: Support for corrected W-2 forms
4. **Custom Logo**: Add company logo to W-2 forms
5. **Digital Signatures**: Electronic signature support
6. **Email Distribution**: Automatically email W-2s to employees

## Summary

✅ **Complete** - W-2 PDF generation functionality fully implemented
- Professional IRS-compliant layout
- 2-Up format (Copy B and Copy C)
- SSN decryption and formatting
- All required boxes (1-20)
- Ready for production use

**Total Lines Added**: ~260 lines of PDF generation code
**Dependencies**: No new packages needed (pdfkit already installed)
**Breaking Changes**: None (backward compatible)
