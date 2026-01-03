/**
 * Payroll Queue using BullMQ
 *
 * This module provides asynchronous payroll processing using Redis-backed job queues.
 * Benefits:
 * - Handles large payroll runs (1000+ employees) without timeout
 * - Progress tracking for real-time UI updates
 * - Automatic retries on failure
 * - Job persistence (survives server restarts)
 *
 * Architecture:
 * 1. API endpoint creates PayrollRun record and enqueues job
 * 2. Worker process picks up job from queue
 * 3. Worker processes employees in batches
 * 4. Progress updates stored in database
 * 5. Frontend polls for status or uses WebSocket
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { prisma } from '../index.js';
import { PayrollCalculator } from '../services/payrollCalculator.js';
import { logger } from '../services/logger.js';
import type { Employee, Company } from '@prisma/client';

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false
};

// Job data structure
export interface PayrollJobData {
  payrollRunId: string;
  companyId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  payDate: Date;
  employeePayData: Array<{
    employeeId: string;
    hoursWorked?: number;
    overtimeHours?: number;
    bonus?: number;
    commission?: number;
    reimbursements?: number;
    creditCardTips?: number;
    cashTips?: number;
  }>;
  initiatedBy: string;
  initiatedByEmail: string;
}

// Create the queue
export const payrollQueue = new Queue('payroll-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000 // Start with 5 second delay, doubles each attempt
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // Keep completed jobs for 7 days
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 30 * 24 * 3600 // Keep failed jobs for 30 days
    }
  }
});

// Queue events for monitoring
export const payrollQueueEvents = new QueueEvents('payroll-processing', {
  connection: redisConnection
});

// Listen to queue events
payrollQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Payroll job ${jobId} completed successfully`);
});

payrollQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Payroll job ${jobId} failed:`, failedReason);
});

/**
 * Worker to process payroll jobs
 * Run this in a separate process or container
 */
export function createPayrollWorker() {
  const worker = new Worker<PayrollJobData>(
    'payroll-processing',
    async (job: Job<PayrollJobData>) => {
      const { payrollRunId, companyId, employeePayData, payPeriodStart, payPeriodEnd, payDate } = job.data;

      logger.info(`Processing payroll run ${payrollRunId} for company ${companyId}`);

      try {
        // Update status to PROCESSING
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: 'PROCESSING',
            startedAt: new Date()
          }
        });

        // Fetch all employees with company data
        const employeeIds = employeePayData.map(e => e.employeeId);
        const employees = await prisma.employee.findMany({
          where: {
            id: { in: employeeIds },
            companyId,
            isActive: true
          },
          include: { company: true }
        });

        // Build employee map
        const employeeMap = new Map(employees.map(e => [e.id, e]));

        const calculator = new PayrollCalculator();
        const BATCH_SIZE = 50; // Process 50 employees at a time
        let processedCount = 0;
        let errorCount = 0;
        const errors: Array<{ employeeId: string; error: string }> = [];

        // Process in batches
        for (let i = 0; i < employeePayData.length; i += BATCH_SIZE) {
          const batch = employeePayData.slice(i, i + BATCH_SIZE);

          // Process batch in parallel
          await Promise.allSettled(
            batch.map(async (employeeData) => {
              const employee = employeeMap.get(employeeData.employeeId);
              if (!employee) {
                errors.push({
                  employeeId: employeeData.employeeId,
                  error: 'Employee not found or inactive'
                });
                errorCount++;
                return;
              }

              try {
                // Get YTD totals
                const payYear = new Date(payDate).getFullYear();
                const yearStart = new Date(payYear, 0, 1);

                const ytdTotals = await prisma.payroll.aggregate({
                  where: {
                    employeeId: employee.id,
                    payDate: {
                      gte: yearStart,
                      lt: new Date(payDate)
                    },
                    status: { not: 'VOID' }
                  },
                  _sum: {
                    grossPay: true,
                    federalWithholding: true,
                    socialSecurity: true,
                    medicare: true,
                    stateWithholding: true,
                    netPay: true
                  }
                });

                const prevGross = Number(ytdTotals._sum.grossPay || 0);

                // Calculate payroll
                const calcResult = await calculator.calculate({
                  employee,
                  payPeriodStart: new Date(payPeriodStart),
                  payPeriodEnd: new Date(payPeriodEnd),
                  hoursWorked: employeeData.hoursWorked,
                  overtimeHours: employeeData.overtimeHours,
                  bonus: employeeData.bonus,
                  commission: employeeData.commission,
                  reimbursements: employeeData.reimbursements,
                  creditCardTips: employeeData.creditCardTips,
                  cashTips: employeeData.cashTips,
                  ytdGrossWages: prevGross,
                  city: employee.city,
                  county: employee.county || undefined,
                  workCity: employee.workCity || undefined,
                  workState: employee.workState || undefined,
                  isResident: employee.localResident ?? true,
                  sutaRate: employee.company.sutaRate ? Number(employee.company.sutaRate) : undefined
                });

                // Calculate new YTD totals
                const newYtdGross = prevGross + calcResult.earnings.grossPay;
                const newYtdFederal = Number(ytdTotals._sum.federalWithholding || 0) + calcResult.taxes.federal.incomeTax;
                const newYtdSS = Number(ytdTotals._sum.socialSecurity || 0) + calcResult.taxes.federal.socialSecurity;
                const newYtdMedicare = Number(ytdTotals._sum.medicare || 0) + calcResult.taxes.federal.medicare;
                const newYtdState = Number(ytdTotals._sum.stateWithholding || 0) + calcResult.taxes.state.incomeTax;
                const newYtdNet = Number(ytdTotals._sum.netPay || 0) + calcResult.netPay;

                // Save payroll record
                await prisma.payroll.create({
                  data: {
                    employeeId: employee.id,
                    companyId,
                    payPeriodStart: new Date(payPeriodStart),
                    payPeriodEnd: new Date(payPeriodEnd),
                    payDate: new Date(payDate),
                    regularHours: calcResult.earnings.regularHours,
                    overtimeHours: calcResult.earnings.overtimeHours,
                    regularPay: calcResult.earnings.regularPay,
                    overtimePay: calcResult.earnings.overtimePay,
                    bonus: calcResult.earnings.bonus,
                    commission: calcResult.earnings.commission,
                    creditCardTips: calcResult.earnings.creditCardTips,
                    cashTips: calcResult.earnings.cashTips,
                    grossPay: calcResult.earnings.grossPay,
                    federalWithholding: calcResult.taxes.federal.incomeTax,
                    socialSecurity: calcResult.taxes.federal.socialSecurity,
                    medicare: calcResult.taxes.federal.medicare,
                    stateWithholding: calcResult.taxes.state.incomeTax,
                    stateDisability: calcResult.taxes.state.sdi,
                    localWithholding: calcResult.taxes.local?.total || 0,
                    retirement401k: calcResult.retirement401k,
                    employerFuta: calcResult.employerTaxes.futa,
                    employerSuta: calcResult.employerTaxes.suta,
                    employerSocialSecurity: calcResult.employerTaxes.socialSecurity,
                    employerMedicare: calcResult.employerTaxes.medicare,
                    totalEmployerTax: calcResult.employerTaxes.total,
                    employer401kMatch: calcResult.employer401kMatch,
                    totalDeductions: calcResult.totalDeductions,
                    netPay: calcResult.netPay,
                    reimbursements: calcResult.reimbursements,
                    ytdGrossPay: newYtdGross,
                    ytdFederalTax: newYtdFederal,
                    ytdSocialSecurity: newYtdSS,
                    ytdMedicare: newYtdMedicare,
                    ytdStateTax: newYtdState,
                    ytdNetPay: newYtdNet,
                    status: 'PROCESSED'
                  }
                });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({
                  employeeId: employeeData.employeeId,
                  error: errorMessage
                });
                errorCount++;
                logger.error(`Error processing employee ${employeeData.employeeId}:`, error);
              }
            })
          );

          processedCount += batch.length;

          // Update progress
          const progress = Math.round((processedCount / employeePayData.length) * 100);
          await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
              progress,
              processedCount,
              errorCount
            }
          });

          // Report progress to BullMQ
          await job.updateProgress(progress);
        }

        // Calculate results summary
        const payrolls = await prisma.payroll.findMany({
          where: {
            companyId,
            payDate: new Date(payDate),
            payPeriodStart: new Date(payPeriodStart),
            payPeriodEnd: new Date(payPeriodEnd)
          }
        });

        const summary = {
          totalEmployees: payrolls.length,
          totalGrossPay: payrolls.reduce((sum, p) => sum + Number(p.grossPay), 0),
          totalNetPay: payrolls.reduce((sum, p) => sum + Number(p.netPay), 0),
          totalFederalTax: payrolls.reduce((sum, p) => sum + Number(p.federalWithholding), 0),
          totalStateTax: payrolls.reduce((sum, p) => sum + Number(p.stateWithholding), 0),
          totalEmployerTax: payrolls.reduce((sum, p) => sum + Number(p.totalEmployerTax), 0)
        };

        // Mark as completed
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: errorCount > 0 && errorCount === employeePayData.length ? 'FAILED' : 'COMPLETED',
            completedAt: new Date(),
            resultsSummary: summary,
            errorDetails: errors.length > 0 ? errors : undefined,
            errorMessage: errorCount > 0 ? `${errorCount} errors occurred during processing` : undefined
          }
        });

        logger.info(`Payroll run ${payrollRunId} completed: ${processedCount} processed, ${errorCount} errors`);

        return {
          success: true,
          processedCount,
          errorCount,
          summary
        };
      } catch (error) {
        logger.error(`Payroll run ${payrollRunId} failed:`, error);

        // Mark as failed
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : String(error)
          }
        });

        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: parseInt(process.env.PAYROLL_WORKER_CONCURRENCY || '2') // Process 2 payroll runs concurrently
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Worker failed job ${job?.id}:`, error);
  });

  return worker;
}
