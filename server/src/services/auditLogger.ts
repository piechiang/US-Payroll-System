import { PrismaClient } from '@prisma/client';
import { storage } from '../middleware/requestLogger.js';

const prisma = new PrismaClient();

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT'
}

export enum AuditEntity {
  EMPLOYEE = 'EMPLOYEE',
  PAYROLL = 'PAYROLL',
  COMPANY = 'COMPANY',
  TAX_INFO = 'TAX_INFO',
  W2_FORM = 'W2_FORM',
  GARNISHMENT = 'GARNISHMENT',
  CONTRACTOR = 'CONTRACTOR'
}

interface AuditLogData {
  userId: string;
  companyId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  /**
   * Create an audit log entry
   */
  static async log(data: AuditLogData): Promise<void> {
    try {
      const requestId = storage.getStore()?.get('requestId') || 'unknown';

      await prisma.auditLog.create({
        data: {
          userId: data.userId,
          companyId: data.companyId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          changes: data.changes ? JSON.stringify(data.changes) : null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          requestId,
          timestamp: new Date()
        }
      });
    } catch (error) {
      // Don't throw - audit logging should not break application flow
      console.error('[AuditLogger] Failed to create audit log:', error);
    }
  }

  /**
   * Log employee data access (for compliance)
   */
  static async logEmployeeAccess(
    userId: string,
    companyId: string,
    employeeId: string,
    action: AuditAction.VIEW | AuditAction.EXPORT,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      userId,
      companyId,
      action,
      entity: AuditEntity.EMPLOYEE,
      entityId: employeeId,
      metadata
    });
  }

  /**
   * Log payroll operations
   */
  static async logPayrollOperation(
    userId: string,
    companyId: string,
    payrollId: string,
    action: AuditAction,
    changes?: Record<string, any>
  ): Promise<void> {
    await this.log({
      userId,
      companyId,
      action,
      entity: AuditEntity.PAYROLL,
      entityId: payrollId,
      changes
    });
  }

  /**
   * Get audit trail for an entity
   */
  static async getAuditTrail(
    entityType: AuditEntity,
    entityId: string,
    limit: number = 100
  ) {
    return prisma.auditLog.findMany({
      where: {
        entity: entityType,
        entityId
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  /**
   * Get company-wide audit logs with filters
   */
  static async getCompanyAuditLogs(
    companyId: string,
    filters?: {
      userId?: string;
      entity?: AuditEntity;
      action?: AuditAction;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number = 100,
    offset: number = 0
  ) {
    const where: any = { companyId };

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.entity) where.entity = filters.entity;
    if (filters?.action) where.action = filters.action;
    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc'
        },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    return { logs, total };
  }
}
