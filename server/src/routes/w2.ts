/**
 * W-2 Form Routes
 *
 * Endpoints for generating, viewing, and managing W-2 forms.
 */

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { AuthRequest, authorizeCompanyRole, hasCompanyAccess, isRoleAllowed } from '../middleware/auth.js';
import { decrypt, maskSSN, isEncrypted } from '../services/encryption.js';
import {
  generateW2ForEmployee,
  generateW2sForCompany,
  saveW2ToDatabase,
  getW2Summary,
  W2Data
} from '../services/w2Generator.js';
import { logger } from '../services/logger.js';
import { exportLimiter } from '../middleware/rateLimit.js';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const generateW2Schema = z.object({
  companyId: z.string(),
  taxYear: z.number().int().min(2020).max(2099),
  employeeIds: z.array(z.string()).optional() // If not provided, generate for all
});

const taxYearQuerySchema = z.object({
  taxYear: z.string().transform(s => parseInt(s, 10)).pipe(z.number().int().min(2020).max(2099))
});

/**
 * POST /api/w2/generate
 * Generate W-2 forms for employees
 * Rate limited: 10 exports per hour
 */
router.post('/generate', authorizeCompanyRole('ADMIN', 'ACCOUNTANT'), exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const data = generateW2Schema.parse(req.body);

    // Multi-tenant check
    if (!hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    let w2s: W2Data[];

    if (data.employeeIds && data.employeeIds.length > 0) {
      // Generate for specific employees
      w2s = [];
      for (const employeeId of data.employeeIds) {
        // Verify employee belongs to company
        const employee = await prisma.employee.findFirst({
          where: { id: employeeId, companyId: data.companyId }
        });

        if (!employee) {
          return res.status(404).json({
            error: 'Employee not found',
            employeeId
          });
        }

        try {
          const w2 = await generateW2ForEmployee(employeeId, data.taxYear);
          w2s.push(w2);
        } catch (error: any) {
          return res.status(400).json({
            error: 'Failed to generate W-2',
            employeeId,
            message: error.message
          });
        }
      }
    } else {
      // Generate for all employees
      w2s = await generateW2sForCompany(data.companyId, data.taxYear);
    }

    // Save to database
    const savedIds: string[] = [];
    for (const w2 of w2s) {
      const id = await saveW2ToDatabase(w2);
      savedIds.push(id);
    }

    // Mask SSNs in response
    const maskedW2s = w2s.map(w2 => ({
      ...w2,
      employeeSSN: maskSSN(w2.employeeSSN)
    }));

    res.json({
      message: `Generated ${w2s.length} W-2 form(s)`,
      taxYear: data.taxYear,
      count: w2s.length,
      w2Ids: savedIds,
      w2s: maskedW2s
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Error generating W-2s:', error);
    res.status(500).json({ error: 'Failed to generate W-2 forms' });
  }
});

/**
 * GET /api/w2/company/:companyId
 * List all W-2 forms for a company
 */
router.get('/company/:companyId', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { taxYear } = taxYearQuerySchema.parse(req.query);

    // Multi-tenant check
    if (!hasCompanyAccess(req, companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const w2s = await prisma.w2Form.findMany({
      where: { companyId, taxYear },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ssn: true
          }
        }
      },
      orderBy: [
        { employee: { lastName: 'asc' } },
        { employee: { firstName: 'asc' } }
      ]
    });

    // Mask SSNs
    const masked = w2s.map(w2 => ({
      ...w2,
      employee: {
        ...w2.employee,
        ssn: maskSSN(w2.employee.ssn)
      },
      box12Codes: w2.box12Codes ? JSON.parse(w2.box12Codes) : [],
      box14Other: w2.box14Other ? JSON.parse(w2.box14Other) : []
    }));

    res.json({
      taxYear,
      count: masked.length,
      w2s: masked
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tax year' });
    }
    logger.error('Error fetching W-2s:', error);
    res.status(500).json({ error: 'Failed to fetch W-2 forms' });
  }
});

/**
 * GET /api/w2/company/:companyId/summary
 * Get W-2 generation summary for a company
 */
router.get('/company/:companyId/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { taxYear } = taxYearQuerySchema.parse(req.query);

    // Multi-tenant check
    if (!hasCompanyAccess(req, companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const summary = await getW2Summary(companyId, taxYear);

    res.json({
      taxYear,
      ...summary
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tax year' });
    }
    logger.error('Error fetching W-2 summary:', error);
    res.status(500).json({ error: 'Failed to fetch W-2 summary' });
  }
});

/**
 * GET /api/w2/:id
 * Get a specific W-2 form
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const w2 = await prisma.w2Form.findUnique({
      where: { id: req.params.id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ssn: true,
            address: true,
            city: true,
            state: true,
            zipCode: true
          }
        },
        company: {
          select: {
            id: true,
            name: true,
            ein: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            stateWithholdingId: true
          }
        }
      }
    });

    if (!w2) {
      return res.status(404).json({ error: 'W-2 not found' });
    }

    // Multi-tenant check
    if (!hasCompanyAccess(req, w2.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mask SSN
    const masked = {
      ...w2,
      employee: {
        ...w2.employee,
        ssn: maskSSN(w2.employee.ssn)
      },
      box12Codes: w2.box12Codes ? JSON.parse(w2.box12Codes) : [],
      box14Other: w2.box14Other ? JSON.parse(w2.box14Other) : []
    };

    res.json(masked);
  } catch (error) {
    logger.error('Error fetching W-2:', error);
    res.status(500).json({ error: 'Failed to fetch W-2' });
  }
});

/**
 * GET /api/w2/:id/pdf
 * Download W-2 as PDF
 * Rate limited: 10 exports per hour
 */
router.get('/:id/pdf', exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const w2 = await prisma.w2Form.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        company: true
      }
    });

    if (!w2) {
      return res.status(404).json({ error: 'W-2 not found' });
    }

    // Multi-tenant check
    if (!hasCompanyAccess(req, w2.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isRoleAllowed(req, ['ADMIN', 'ACCOUNTANT', 'MANAGER'], w2.companyId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires one of the following roles: ADMIN, ACCOUNTANT, MANAGER'
      });
    }

    // Generate PDF
    const pdf = await generateW2PDF(w2);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="W2-${w2.taxYear}-${w2.employee.lastName}-${w2.employee.firstName}.pdf"`
    );

    pdf.pipe(res);
    pdf.end();
  } catch (error) {
    logger.error('Error generating W-2 PDF:', error);
    res.status(500).json({ error: 'Failed to generate W-2 PDF' });
  }
});

/**
 * GET /api/w2/employee/:employeeId
 * Get W-2 forms for an employee (for employee self-service)
 */
router.get('/employee/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;

    // Verify employee exists and user has access
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { companyId: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (!hasCompanyAccess(req, employee.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const w2s = await prisma.w2Form.findMany({
      where: { employeeId },
      orderBy: { taxYear: 'desc' }
    });

    const formatted = w2s.map(w2 => ({
      id: w2.id,
      taxYear: w2.taxYear,
      status: w2.status,
      wagesTipsOther: Number(w2.wagesTipsOther),
      federalWithholding: Number(w2.federalWithholding),
      stateWithholding: Number(w2.stateWithholding),
      generatedAt: w2.generatedAt,
      box12Codes: w2.box12Codes ? JSON.parse(w2.box12Codes) : []
    }));

    res.json({
      employeeId,
      w2s: formatted
    });
  } catch (error) {
    logger.error('Error fetching employee W-2s:', error);
    res.status(500).json({ error: 'Failed to fetch W-2 forms' });
  }
});

/**
 * DELETE /api/w2/:id
 * Delete a W-2 form (only DRAFT status)
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const w2 = await prisma.w2Form.findUnique({
      where: { id: req.params.id }
    });

    if (!w2) {
      return res.status(404).json({ error: 'W-2 not found' });
    }

    if (!hasCompanyAccess(req, w2.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isRoleAllowed(req, ['ADMIN'], w2.companyId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires one of the following roles: ADMIN'
      });
    }

    if (w2.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Cannot delete W-2',
        message: 'Only DRAFT W-2 forms can be deleted'
      });
    }

    await prisma.w2Form.delete({ where: { id: w2.id } });

    res.json({ message: 'W-2 deleted successfully' });
  } catch (error) {
    logger.error('Error deleting W-2:', error);
    res.status(500).json({ error: 'Failed to delete W-2' });
  }
});

/**
 * Generate W-2 PDF document
 */
async function generateW2PDF(w2: any): Promise<PDFKit.PDFDocument> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 30 });

  // Decrypt SSN for PDF
  let ssn = w2.employee.ssn;
  if (isEncrypted(ssn)) {
    ssn = decrypt(ssn);
  }

  const formatMoney = (n: any) => {
    const num = Number(n || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Title
  doc.fontSize(16).font('Helvetica-Bold')
    .text(`Form W-2 Wage and Tax Statement`, { align: 'center' });
  doc.fontSize(12).font('Helvetica')
    .text(`Tax Year ${w2.taxYear}`, { align: 'center' });
  doc.moveDown(0.5);

  // Draw boxes
  const startY = doc.y;
  const boxWidth = 270;
  const boxHeight = 50;
  const gap = 10;
  const leftX = 30;
  const rightX = leftX + boxWidth + gap;

  // Helper to draw a labeled box
  const drawBox = (x: number, y: number, width: number, height: number, label: string, value: string, boxNum?: string) => {
    doc.rect(x, y, width, height).stroke();
    doc.fontSize(8).font('Helvetica');
    if (boxNum) {
      doc.text(boxNum, x + 2, y + 2, { width: 15 });
      doc.text(label, x + 15, y + 2, { width: width - 20 });
    } else {
      doc.text(label, x + 2, y + 2, { width: width - 4 });
    }
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text(value, x + 5, y + 18, { width: width - 10 });
  };

  let y = startY;

  // Row 1: Employee SSN (a) and Employer EIN (b)
  drawBox(leftX, y, boxWidth, boxHeight, "Employee's social security number", ssn, 'a');
  drawBox(rightX, y, boxWidth, boxHeight, "Employer identification number (EIN)", w2.company.ein, 'b');
  y += boxHeight;

  // Row 2: Employer name/address (c) and Control number (d)
  const employerAddr = `${w2.company.name}\n${w2.company.address}\n${w2.company.city}, ${w2.company.state} ${w2.company.zipCode}`;
  drawBox(leftX, y, boxWidth, boxHeight * 1.5, "Employer's name, address, and ZIP code", employerAddr, 'c');
  drawBox(rightX, y, boxWidth, boxHeight / 2, "Control number", w2.controlNumber || '', 'd');
  y += boxHeight * 1.5;

  // Row 3: Employee name (e)
  drawBox(leftX, y, boxWidth * 2 + gap, boxHeight / 2, "Employee's first name and initial, Last name, Suff.",
    `${w2.employee.firstName} ${w2.employee.lastName}`, 'e');
  y += boxHeight / 2;

  // Row 4: Employee address (f)
  const employeeAddr = `${w2.employee.address}\n${w2.employee.city}, ${w2.employee.state} ${w2.employee.zipCode}`;
  drawBox(leftX, y, boxWidth * 2 + gap, boxHeight, "Employee's address and ZIP code", employeeAddr, 'f');
  y += boxHeight + 10;

  // Wage boxes (1-6)
  const smallBoxWidth = (boxWidth * 2 + gap) / 4;
  const smallBoxHeight = 40;

  // Row: Box 1, 2, 3, 4
  drawBox(leftX, y, smallBoxWidth, smallBoxHeight, 'Wages, tips, other comp.', formatMoney(w2.wagesTipsOther), '1');
  drawBox(leftX + smallBoxWidth, y, smallBoxWidth, smallBoxHeight, 'Federal income tax withheld', formatMoney(w2.federalWithholding), '2');
  drawBox(leftX + smallBoxWidth * 2, y, smallBoxWidth, smallBoxHeight, 'Social security wages', formatMoney(w2.socialSecurityWages), '3');
  drawBox(leftX + smallBoxWidth * 3, y, smallBoxWidth, smallBoxHeight, 'Social security tax withheld', formatMoney(w2.socialSecurityTax), '4');
  y += smallBoxHeight;

  // Row: Box 5, 6, 7, 8
  drawBox(leftX, y, smallBoxWidth, smallBoxHeight, 'Medicare wages and tips', formatMoney(w2.medicareWages), '5');
  drawBox(leftX + smallBoxWidth, y, smallBoxWidth, smallBoxHeight, 'Medicare tax withheld', formatMoney(w2.medicareTax), '6');
  drawBox(leftX + smallBoxWidth * 2, y, smallBoxWidth, smallBoxHeight, 'Social security tips', formatMoney(w2.socialSecurityTips), '7');
  drawBox(leftX + smallBoxWidth * 3, y, smallBoxWidth, smallBoxHeight, 'Allocated tips', formatMoney(w2.allocatedTips), '8');
  y += smallBoxHeight;

  // Row: Box 10, 11, 12a-d, 13
  const thirdWidth = (boxWidth * 2 + gap) / 3;
  drawBox(leftX, y, thirdWidth, smallBoxHeight, 'Dependent care benefits', formatMoney(w2.dependentCareBenefits), '10');
  drawBox(leftX + thirdWidth, y, thirdWidth, smallBoxHeight, 'Nonqualified plans', formatMoney(w2.nonqualifiedPlans), '11');

  // Box 12 codes
  const box12 = w2.box12Codes ? JSON.parse(w2.box12Codes) : [];
  let box12Text = box12.map((b: any) => `${b.code}: $${formatMoney(b.amount)}`).join('\n');
  drawBox(leftX + thirdWidth * 2, y, thirdWidth, smallBoxHeight * 2, 'See instructions for box 12', box12Text, '12');
  y += smallBoxHeight;

  // Box 13 checkboxes
  const box13Text = [
    w2.statutoryEmployee ? '[X] Statutory employee' : '[ ] Statutory employee',
    w2.retirementPlan ? '[X] Retirement plan' : '[ ] Retirement plan',
    w2.thirdPartySickPay ? '[X] Third-party sick pay' : '[ ] Third-party sick pay'
  ].join('  ');
  drawBox(leftX, y, thirdWidth * 2, smallBoxHeight, '', box13Text, '13');
  y += smallBoxHeight + 10;

  // State and Local (Box 15-20)
  const stateBoxWidth = (boxWidth * 2 + gap) / 6;
  doc.fontSize(8).font('Helvetica').text('State', leftX, y);
  doc.text('Employer\'s state ID', leftX + stateBoxWidth, y);
  doc.text('State wages', leftX + stateBoxWidth * 2, y);
  doc.text('State income tax', leftX + stateBoxWidth * 3, y);
  doc.text('Local wages', leftX + stateBoxWidth * 4, y);
  doc.text('Local income tax', leftX + stateBoxWidth * 5, y);
  y += 12;

  // Box 15-20 values
  drawBox(leftX, y, stateBoxWidth, smallBoxHeight, '', w2.stateCode || '', '15');
  drawBox(leftX + stateBoxWidth, y, stateBoxWidth, smallBoxHeight, '', w2.stateEmployerId || '');
  drawBox(leftX + stateBoxWidth * 2, y, stateBoxWidth, smallBoxHeight, '', formatMoney(w2.stateWages), '16');
  drawBox(leftX + stateBoxWidth * 3, y, stateBoxWidth, smallBoxHeight, '', formatMoney(w2.stateWithholding), '17');
  drawBox(leftX + stateBoxWidth * 4, y, stateBoxWidth, smallBoxHeight, '', formatMoney(w2.localWages), '18');
  drawBox(leftX + stateBoxWidth * 5, y, stateBoxWidth, smallBoxHeight, '', formatMoney(w2.localWithholding), '19');
  y += smallBoxHeight;

  // Locality name (Box 20)
  drawBox(leftX + stateBoxWidth * 4, y, stateBoxWidth * 2, 25, 'Locality name', w2.localityName || '', '20');

  // Footer
  doc.moveDown(3);
  doc.fontSize(8).font('Helvetica')
    .text('This is Copy B - To Be Filed With Employee\'s FEDERAL Tax Return', { align: 'center' });
  doc.text('This information is being furnished to the Internal Revenue Service.', { align: 'center' });

  return doc;
}

export default router;
