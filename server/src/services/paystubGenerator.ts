import PDFDocument from 'pdfkit';
import { Payroll, Employee, Company, Prisma } from '@prisma/client';
import { maskSSN } from './encryption.js';

interface PaystubData {
  payroll: Payroll;
  employee: Employee;
  company: Company;
}

// Helper to create Decimal-like object
const toDecimal = (value: number): Prisma.Decimal => {
  return new Prisma.Decimal(value);
};

export class PaystubGenerator {
  private doc: PDFKit.PDFDocument;
  private readonly pageWidth = 612; // Letter size
  private readonly pageHeight = 792;
  private readonly margin = 50;
  private readonly contentWidth: number;

  constructor() {
    this.doc = new PDFDocument({
      size: 'LETTER',
      margin: this.margin,
    });
    this.contentWidth = this.pageWidth - 2 * this.margin;
  }

  generate(data: PaystubData): PDFKit.PDFDocument {
    const { payroll, employee, company } = data;

    this.drawHeader(company);
    this.drawEmployeeInfo(employee, payroll);
    this.drawEarningsSection(payroll);
    this.drawDeductionsSection(payroll);
    this.drawEmployerContributions(payroll);
    this.drawSummary(payroll);
    this.drawFooter();

    this.doc.end();
    return this.doc;
  }

  private drawHeader(company: Company) {
    // Company name
    this.doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(company.name, this.margin, this.margin, { align: 'center' });

    // Company address
    this.doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `${company.address}, ${company.city}, ${company.state} ${company.zipCode}`,
        { align: 'center' }
      );

    if (company.phone) {
      this.doc.text(`Phone: ${company.phone}`, { align: 'center' });
    }

    // Title
    this.doc
      .moveDown(1)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('EARNINGS STATEMENT', { align: 'center' });

    this.doc.moveDown(0.5);
    this.drawLine(this.doc.y);
  }

  private drawEmployeeInfo(employee: Employee, payroll: Payroll) {
    const startY = this.doc.y + 15;
    const colWidth = this.contentWidth / 2;

    // Left column - Employee Info
    this.doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('EMPLOYEE INFORMATION', this.margin, startY);

    this.doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Name: ${employee.firstName} ${employee.lastName}`, this.margin, startY + 15)
      .text(`Employee ID: ${employee.id.slice(-8).toUpperCase()}`)
      .text(`Department: ${employee.department || 'N/A'}`)
      .text(`SSN: ${maskSSN(employee.ssn)}`);

    // Right column - Pay Period Info
    this.doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('PAY PERIOD', this.margin + colWidth, startY);

    const payPeriodStart = new Date(payroll.payPeriodStart).toLocaleDateString('en-US');
    const payPeriodEnd = new Date(payroll.payPeriodEnd).toLocaleDateString('en-US');
    const payDate = new Date(payroll.payDate).toLocaleDateString('en-US');

    this.doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Period: ${payPeriodStart} - ${payPeriodEnd}`, this.margin + colWidth, startY + 15)
      .text(`Pay Date: ${payDate}`, this.margin + colWidth);

    this.doc.y = startY + 70;
    this.drawLine(this.doc.y);
  }

  private drawEarningsSection(payroll: Payroll) {
    const startY = this.doc.y + 15;

    // Section header
    this.doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#2563eb')
      .text('EARNINGS', this.margin, startY);

    this.doc.fillColor('black');

    // Table header
    const tableY = startY + 20;
    this.drawTableHeader(['Description', 'Hours', 'Rate', 'Current', 'YTD'], tableY);

    // Table rows
    let rowY = tableY + 20;
    const earnings = [
      {
        desc: 'Regular Pay',
        hours: Number(payroll.regularHours).toFixed(2),
        rate: this.calculateHourlyRate(payroll),
        current: Number(payroll.regularPay).toFixed(2),
        ytd: '-',
      },
    ];

    if (Number(payroll.overtimeHours) > 0) {
      earnings.push({
        desc: 'Overtime Pay',
        hours: Number(payroll.overtimeHours).toFixed(2),
        rate: (parseFloat(this.calculateHourlyRate(payroll)) * 1.5).toFixed(2),
        current: Number(payroll.overtimePay).toFixed(2),
        ytd: '-',
      });
    }

    if (Number(payroll.bonus) > 0) {
      earnings.push({
        desc: 'Bonus',
        hours: '-',
        rate: '-',
        current: Number(payroll.bonus).toFixed(2),
        ytd: '-',
      });
    }

    if (Number(payroll.commission) > 0) {
      earnings.push({
        desc: 'Commission',
        hours: '-',
        rate: '-',
        current: Number(payroll.commission).toFixed(2),
        ytd: '-',
      });
    }

    for (const earning of earnings) {
      this.drawTableRow(
        [earning.desc, earning.hours, `$${earning.rate}`, `$${earning.current}`, earning.ytd],
        rowY
      );
      rowY += 18;
    }

    // Total earnings
    this.doc
      .font('Helvetica-Bold')
      .fontSize(10);
    this.drawTableRow(
      ['GROSS PAY', '', '', `$${Number(payroll.grossPay).toFixed(2)}`, `$${Number(payroll.ytdGrossPay).toFixed(2)}`],
      rowY,
      true
    );

    this.doc.y = rowY + 25;
  }

  private drawDeductionsSection(payroll: Payroll) {
    const startY = this.doc.y + 10;

    // Section header
    this.doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#dc2626')
      .text('DEDUCTIONS', this.margin, startY);

    this.doc.fillColor('black');

    // Table header
    const tableY = startY + 20;
    this.drawTableHeader(['Description', '', '', 'Current', 'YTD'], tableY);

    // Deductions
    let rowY = tableY + 20;
    const deductions = [
      { desc: 'Federal Income Tax', current: payroll.federalWithholding, ytd: payroll.ytdFederalTax },
      { desc: 'Social Security', current: payroll.socialSecurity, ytd: payroll.ytdSocialSecurity },
      { desc: 'Medicare', current: payroll.medicare, ytd: payroll.ytdMedicare },
    ];

    if (Number(payroll.stateWithholding) > 0) {
      deductions.push({
        desc: 'State Income Tax',
        current: payroll.stateWithholding,
        ytd: payroll.ytdStateTax,
      });
    }

    if (Number(payroll.stateDisability) > 0) {
      deductions.push({
        desc: 'State Disability (SDI)',
        current: payroll.stateDisability,
        ytd: toDecimal(0),
      });
    }

    if (Number(payroll.localWithholding) > 0) {
      deductions.push({
        desc: 'Local Tax',
        current: payroll.localWithholding,
        ytd: toDecimal(0),
      });
    }

    if (Number(payroll.retirement401k) > 0) {
      deductions.push({
        desc: '401(k)',
        current: payroll.retirement401k,
        ytd: toDecimal(0),
      });
    }

    for (const ded of deductions) {
      this.doc.font('Helvetica').fontSize(9);
      this.drawTableRow(
        [ded.desc, '', '', `$${Number(ded.current).toFixed(2)}`, `$${Number(ded.ytd).toFixed(2)}`],
        rowY
      );
      rowY += 18;
    }

    // Total deductions
    this.doc
      .font('Helvetica-Bold')
      .fontSize(10);
    this.drawTableRow(
      ['TOTAL DEDUCTIONS', '', '', `$${Number(payroll.totalDeductions).toFixed(2)}`, '-'],
      rowY,
      true
    );

    this.doc.y = rowY + 25;
  }

  private drawSummary(payroll: Payroll) {
    const startY = this.doc.y + 10;

    this.drawLine(startY);

    // Net Pay box
    const boxY = startY + 15;
    const boxWidth = 200;
    const boxHeight = 60;
    const boxX = this.pageWidth - this.margin - boxWidth;

    // Draw box
    this.doc
      .rect(boxX, boxY, boxWidth, boxHeight)
      .fillAndStroke('#f0fdf4', '#22c55e');

    // Net Pay label
    this.doc
      .fillColor('#166534')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('NET PAY', boxX + 10, boxY + 12);

    // Net Pay amount
    this.doc
      .fontSize(24)
      .text(`$${Number(payroll.netPay).toFixed(2)}`, boxX + 10, boxY + 30);

    // YTD Summary on left
    this.doc
      .fillColor('black')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('YEAR-TO-DATE SUMMARY', this.margin, boxY);

    this.doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Gross Earnings: $${Number(payroll.ytdGrossPay).toFixed(2)}`, this.margin, boxY + 18)
      .text(`Total Taxes: $${(Number(payroll.ytdFederalTax) + Number(payroll.ytdSocialSecurity) + Number(payroll.ytdMedicare) + Number(payroll.ytdStateTax)).toFixed(2)}`)
      .text(`Net Pay: $${Number(payroll.ytdNetPay).toFixed(2)}`);

    this.doc.y = boxY + boxHeight + 20;
  }

  private drawEmployerContributions(payroll: Payroll) {
    if (Number(payroll.employer401kMatch) <= 0) {
      return;
    }

    const startY = this.doc.y + 10;

    this.doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#16a34a')
      .text('EMPLOYER CONTRIBUTIONS', this.margin, startY);

    this.doc.fillColor('black');

    const tableY = startY + 20;
    this.drawTableHeader(['Description', '', '', 'Current', 'YTD'], tableY);

    let rowY = tableY + 20;
    this.doc.font('Helvetica').fontSize(9);
    this.drawTableRow(
      ['401(k) Match', '', '', `$${Number(payroll.employer401kMatch).toFixed(2)}`, '-'],
      rowY
    );

    this.doc.y = rowY + 25;
  }

  private drawFooter() {
    const footerY = this.pageHeight - this.margin - 30;

    this.drawLine(footerY);

    this.doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666666')
      .text(
        'This is a computer-generated document. Please retain for your records.',
        this.margin,
        footerY + 10,
        { align: 'center' }
      )
      .text(
        `Generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US')}`,
        { align: 'center' }
      );
  }

  private drawLine(y: number) {
    this.doc
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .moveTo(this.margin, y)
      .lineTo(this.pageWidth - this.margin, y)
      .stroke();
  }

  private drawTableHeader(headers: string[], y: number) {
    const colWidths = [180, 60, 70, 80, 80];
    let x = this.margin;

    this.doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#6b7280');

    headers.forEach((header, i) => {
      this.doc.text(header, x, y, { width: colWidths[i], align: i > 2 ? 'right' : 'left' });
      x += colWidths[i];
    });

    this.doc.fillColor('black');
  }

  private drawTableRow(values: string[], y: number, isBold = false) {
    const colWidths = [180, 60, 70, 80, 80];
    let x = this.margin;

    this.doc
      .fontSize(9)
      .font(isBold ? 'Helvetica-Bold' : 'Helvetica');

    values.forEach((value, i) => {
      this.doc.text(value, x, y, { width: colWidths[i], align: i > 2 ? 'right' : 'left' });
      x += colWidths[i];
    });
  }

  private calculateHourlyRate(payroll: Payroll): string {
    if (Number(payroll.regularHours) > 0) {
      return (Number(payroll.regularPay) / Number(payroll.regularHours)).toFixed(2);
    }
    return '0.00';
  }
}

export function generatePaystubPDF(data: PaystubData): PDFKit.PDFDocument {
  const generator = new PaystubGenerator();
  return generator.generate(data);
}
