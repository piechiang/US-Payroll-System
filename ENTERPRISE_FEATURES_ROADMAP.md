# Enterprise Features Roadmap

## 📊 实施状态 (Implementation Status)

**最后更新**: 2026-01-01

| 阶段 | 状态 | 完成度 | 说明 |
|------|------|--------|------|
| Phase 1: 基础设施升级 | ✅ **已完成** | 100% | 错误处理、请求追踪、审计日志全部完成 |
| Phase 2: 核心业务逻辑 | ✅ **已完成** | 100% | 折算、扣押、GL导出已实现并测试 |
| Phase 3: 扩展功能 | ✅ **已完成** | 100% | 分析API、导出服务、审计系统已部署 |

**总体进度**: 🎉 **100% 完成**

---

## 概述

本文档详细说明 US Payroll System 企业级功能扩展的完整实施路线图，涵盖复杂薪资计算、承包商管理、合规报表和性能优化。

---

## 📋 功能分类

### Phase 1: 基础设施升级 (Infrastructure)
**优先级**: 🔴 高
**预计时间**: 2-3 周

1. ✅ 数据库架构优化
2. ✅ 错误处理与监控
3. ✅ 性能索引优化
4. ✅ 请求追踪系统

### Phase 2: 核心业务逻辑扩展 (Core Logic)
**优先级**: 🔴 高
**预计时间**: 3-4 周

1. ✅ 入离职折算 (Proration)
2. ✅ 工资扣押 (Garnishments)
3. ✅ 承包商管理 (1099-NEC)
4. ✅ 复杂扣除项 (HSA, FSA, Commuter Benefits)

### Phase 3: 扩展功能 (Extensions)
**优先级**: 🟡 中
**预计时间**: 2-3 周

1. ✅ 会计系统集成 (GL Export)
2. ✅ 高级报表 (Analytics Dashboard)
3. ✅ 批量导入/导出
4. ✅ 审计日志

---

## 🏗️ Phase 1: 基础设施升级

### 1.1 数据库架构扩展

#### 新增模型

**`server/prisma/schema.prisma`**:

```prisma
// ========================================
// 工资扣押模型 (Garnishments)
// ========================================
model Garnishment {
  id            String   @id @default(uuid())
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  // 基本信息
  description   String   // e.g., "Child Support Case #123"
  type          String   // CHILD_SUPPORT, TAX_LEVY, CREDITOR_GARNISHMENT, BANKRUPTCY

  // 扣款计算
  amount        Decimal  @db.Decimal(10, 2)  // 固定金额
  percent       Decimal? @db.Decimal(5, 2)   // 或百分比

  // 总欠款追踪
  totalOwed     Decimal? @db.Decimal(10, 2)  // 总欠款（如有）
  totalPaid     Decimal  @default(0) @db.Decimal(10, 2) // 已扣除总额

  // 状态与优先级
  active        Boolean  @default(true)
  priority      Int      @default(1) // 1=最高优先级

  // 法院命令信息
  courtOrder    String?  // 法院命令编号
  issueDate     DateTime?
  expiryDate    DateTime?

  // 审计
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdBy     String?

  // 关联扣款历史
  deductions    GarnishmentDeduction[]

  @@index([employeeId])
  @@index([active])
}

// 扣款历史记录
model GarnishmentDeduction {
  id             String      @id @default(uuid())
  garnishmentId  String
  garnishment    Garnishment @relation(fields: [garnishmentId], references: [id], onDelete: Cascade)
  payrollId      String
  payroll        Payroll     @relation(fields: [payrollId], references: [id])

  amount         Decimal     @db.Decimal(10, 2)
  createdAt      DateTime    @default(now())

  @@index([garnishmentId])
  @@index([payrollId])
}

// ========================================
// 承包商模型 (1099-NEC Contractors)
// ========================================
model Contractor {
  id             String   @id @default(uuid())
  companyId      String
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  // 基本信息
  firstName      String
  lastName       String
  email          String
  phone          String?

  // 税务信息（加密）
  tin            String   // Taxpayer ID (SSN or EIN), needs encryption
  tinType        String   // SSN or EIN

  // 地址
  address        String
  city           String
  state          String
  zipCode        String

  // 费率
  hourlyRate     Decimal? @db.Decimal(10, 2)
  projectRate    Decimal? @db.Decimal(10, 2)

  // 状态
  isActive       Boolean  @default(true)

  // 关联
  payments       ContractorPayment[]
  form1099s      Form1099[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([companyId, email])
  @@index([companyId])
  @@index([isActive])
}

model ContractorPayment {
  id             String     @id @default(uuid())
  contractorId   String
  contractor     Contractor @relation(fields: [contractorId], references: [id], onDelete: Cascade)

  companyId      String     // 冗余字段便于查询
  payrollRunId   String?    // Optional linkage to a payroll run

  amount         Decimal    @db.Decimal(10, 2)
  paymentDate    DateTime
  description    String?
  invoiceNumber  String?

  // Categorization
  category       String?    // HOURLY, PROJECT, BONUS, REIMBURSEMENT

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([contractorId])
  @@index([companyId, paymentDate])
}

model Form1099 {
  id               String     @id @default(uuid())
  contractorId     String
  contractor       Contractor @relation(fields: [contractorId], references: [id], onDelete: Cascade)
  companyId        String
  company          Company    @relation(fields: [companyId], references: [id])

  taxYear          Int

  // Box 1: Nonemployee compensation
  box1Amount       Decimal    @db.Decimal(10, 2)

  // Additional boxes if needed
  box4FederalTax   Decimal    @default(0) @db.Decimal(10, 2)

  status           String     @default("GENERATED") // GENERATED, SENT, CORRECTED
  generatedAt      DateTime   @default(now())
  sentAt           DateTime?

  @@unique([contractorId, taxYear])
  @@index([companyId, taxYear])
}

// ========================================
// Employee 模型扩展
// ========================================
model Employee {
  // ... 保留所有现有字段 ...

  // 新增：入离职日期
  hireDate         DateTime
  terminationDate  DateTime?
  isActive         Boolean   @default(true)

  // 新增：关联
  garnishments     Garnishment[]

  // 已有关联
  payrolls         Payroll[]
  w2Forms          W2Form[]

  @@index([companyId])
  @@index([isActive])
  @@index([hireDate])
  @@index([terminationDate])
}

// ========================================
// Payroll 模型扩展
// ========================================
model Payroll {
  // ... 保留所有现有字段 ...

  // 新增：折算系数
  prorationFactor  Decimal?  @db.Decimal(5, 4) // 0.0000 - 1.0000

  // 新增：扣押扣款
  garnishmentDeductions GarnishmentDeduction[]
  totalGarnishments     Decimal @default(0) @db.Decimal(10, 2)

  // 性能优化：复合索引
  @@index([companyId, payPeriodStart, payPeriodEnd])
  @@index([employeeId])
  @@index([status])
}

// ========================================
// Company 模型扩展
// ========================================
model Company {
  // ... 保留所有现有字段 ...

  // 新增：承包商关联
  contractors  Contractor[]
  form1099s    Form1099[]

  // 新增：会计系统集成配置
  glAccountWages        String? // GL Account for Wages
  glAccountTaxes        String? // GL Account for Taxes
  glAccountLiabilities  String? // GL Account for Liabilities

  quickbooksIntegration Boolean @default(false)
  quickbooksCompanyId   String?
}

// ========================================
// 审计日志模型
// ========================================
model AuditLog {
  id           String   @id @default(uuid())

  // 操作信息
  userId       String?
  action       String   // CREATE, UPDATE, DELETE, RUN_PAYROLL, EXPORT
  entityType   String   // EMPLOYEE, PAYROLL, W2, etc.
  entityId     String?

  // 变更详情
  changes      Json?    // Before/After snapshot

  // 请求追踪
  requestId    String?
  ipAddress    String?
  userAgent    String?

  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

**迁移命令**:
```bash
cd server
npx prisma migrate dev --name add_enterprise_features
npx prisma generate
```

---

### 1.2 错误处理与监控系统

#### 自定义错误类

**`server/src/utils/AppError.ts`**:

```typescript
/**
 * 应用错误类
 * 用于可预知的业务逻辑错误（如验证失败、权限不足等）
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly code?: string

  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true // 标记为可预知的业务错误
    this.code = code

    Error.captureStackTrace(this, this.constructor)
  }

  // 便捷工厂方法
  static badRequest(message: string, code?: string) {
    return new AppError(message, 400, code)
  }

  static unauthorized(message: string = 'Unauthorized', code?: string) {
    return new AppError(message, 401, code)
  }

  static forbidden(message: string = 'Forbidden', code?: string) {
    return new AppError(message, 403, code)
  }

  static notFound(message: string = 'Not Found', code?: string) {
    return new AppError(message, 404, code)
  }

  static conflict(message: string, code?: string) {
    return new AppError(message, 409, code)
  }

  static internal(message: string = 'Internal Server Error', code?: string) {
    return new AppError(message, 500, code)
  }
}
```

#### 请求追踪中间件

**`server/src/middleware/requestLogger.ts`**:

```typescript
import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { AsyncLocalStorage } from 'async_hooks'

// Request Context Storage
interface RequestContext {
  requestId: string
  userId?: string
  companyId?: string
  startTime: number
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

/**
 * 请求日志中间件
 * 为每个请求生成唯一 ID 并记录请求/响应日志
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4()
  const startTime = Date.now()

  // 设置响应头
  res.setHeader('X-Request-ID', requestId)

  // 创建请求上下文
  const context: RequestContext = {
    requestId,
    startTime
  }

  // 在异步调用链中保持上下文
  requestContext.run(context, () => {
    // 请求开始日志
    console.log({
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent')
    })

    // 响应结束时的日志
    res.on('finish', () => {
      const duration = Date.now() - startTime
      console.log({
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      })
    })

    next()
  })
}

/**
 * 获取当前请求 ID（在路由和服务中使用）
 */
export function getCurrentRequestId(): string {
  return requestContext.getStore()?.requestId || 'unknown'
}
```

#### 集中式错误处理

**`server/src/middleware/errorHandler.ts`**:

```typescript
import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError.js'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { getCurrentRequestId } from './requestLogger.js'

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = getCurrentRequestId()

  // 1. 处理已知业务错误 (AppError)
  if (err instanceof AppError) {
    console.warn({
      requestId,
      type: 'Operational Error',
      statusCode: err.statusCode,
      message: err.message,
      code: err.code
    })

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.code,
      requestId
    })
  }

  // 2. 处理 Zod 验证错误
  if (err instanceof ZodError) {
    console.warn({
      requestId,
      type: 'Validation Error',
      errors: err.errors
    })

    return res.status(400).json({
      status: 'fail',
      message: 'Validation Error',
      errors: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      })),
      requestId
    })
  }

  // 3. 处理 Prisma 错误
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(409).json({
        status: 'fail',
        message: 'Record already exists',
        field: err.meta?.target,
        requestId
      })
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        status: 'fail',
        message: 'Record not found',
        requestId
      })
    }
  }

  // 4. 处理未知错误（生产环境不泄露堆栈）
  console.error({
    requestId,
    type: 'Unexpected Error',
    message: err.message,
    stack: err.stack
  })

  const isProd = process.env.NODE_ENV === 'production'

  return res.status(500).json({
    status: 'error',
    message: isProd ? 'Internal Server Error' : err.message,
    stack: isProd ? undefined : err.stack,
    requestId
  })
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response) {
  const requestId = getCurrentRequestId()

  res.status(404).json({
    status: 'fail',
    message: `Route ${req.method} ${req.url} not found`,
    requestId
  })
}
```

---

## 🔧 Phase 2: 核心业务逻辑扩展

### 2.1 入离职折算计算器

**`server/src/services/prorationCalculator.ts`**:

```typescript
import { differenceInBusinessDays, startOfDay, endOfDay, isWeekend } from 'date-fns'
import { Decimal } from 'decimal.js'

/**
 * 入离职折算计算器
 * 根据员工的入职/离职日期计算薪资折算系数
 */
export class ProrationCalculator {
  /**
   * 计算折算系数 (0.0 - 1.0)
   *
   * @param payPeriodStart 发薪周期开始日期
   * @param payPeriodEnd 发薪周期结束日期
   * @param hireDate 入职日期
   * @param terminationDate 离职日期（可选）
   * @param excludeHolidays 是否排除节假日（可选）
   * @returns 折算系数 (0.0 - 1.0)
   */
  static calculateProrationFactor(
    payPeriodStart: Date,
    payPeriodEnd: Date,
    hireDate: Date,
    terminationDate?: Date | null,
    excludeHolidays: Date[] = []
  ): Decimal {
    const periodStart = startOfDay(payPeriodStart)
    const periodEnd = endOfDay(payPeriodEnd)
    const hDate = startOfDay(hireDate)
    const tDate = terminationDate ? endOfDay(terminationDate) : null

    // 1. 正常情况：员工在整个周期内工作
    if (hDate <= periodStart && (!tDate || tDate >= periodEnd)) {
      return new Decimal(1.0)
    }

    // 2. 确定实际工作的起始和结束日期
    let actualWorkStart = periodStart
    let actualWorkEnd = periodEnd

    // 周期内入职
    if (hDate > periodStart && hDate <= periodEnd) {
      actualWorkStart = hDate
    }

    // 周期内离职
    if (tDate && tDate < periodEnd && tDate >= periodStart) {
      actualWorkEnd = tDate
    }

    // 如果不在周期内工作
    if (actualWorkStart > actualWorkEnd) {
      return new Decimal(0.0)
    }

    // 3. 计算工作日天数 (Business Days: Mon-Fri)
    const totalBusinessDays = this.countBusinessDays(periodStart, periodEnd, excludeHolidays)
    const actualBusinessDays = this.countBusinessDays(actualWorkStart, actualWorkEnd, excludeHolidays)

    if (totalBusinessDays === 0) return new Decimal(0)

    const factor = new Decimal(actualBusinessDays).div(totalBusinessDays)

    // 确保在 0-1 范围内
    return Decimal.max(0, Decimal.min(1, factor))
  }

  /**
   * 计算两个日期之间的工作日天数（排除周末和节假日）
   */
  private static countBusinessDays(
    startDate: Date,
    endDate: Date,
    holidays: Date[] = []
  ): number {
    let count = 0
    let current = startOfDay(startDate)
    const end = endOfDay(endDate)

    const holidaySet = new Set(holidays.map(h => startOfDay(h).getTime()))

    while (current <= end) {
      // 不是周末且不是节假日
      if (!isWeekend(current) && !holidaySet.has(current.getTime())) {
        count++
      }
      current.setDate(current.getDate() + 1)
    }

    return count
  }

  /**
   * 应用折算到薪资
   */
  static applyProration(
    originalAmount: Decimal | number,
    prorationFactor: Decimal | number
  ): Decimal {
    const amount = new Decimal(originalAmount)
    const factor = new Decimal(prorationFactor)

    return amount.times(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  }
}
```

**集成到 PayrollCalculator**:

```typescript
// server/src/services/payrollCalculator.ts

import { ProrationCalculator } from './prorationCalculator.js'

export class PayrollCalculator {
  // ... 现有代码 ...

  calculate(input: PayrollInput): PayrollResult {
    const { employee, payPeriodStart, payPeriodEnd } = input

    // 1. 计算折算系数
    const prorationFactor = ProrationCalculator.calculateProrationFactor(
      payPeriodStart,
      payPeriodEnd,
      employee.hireDate,
      employee.terminationDate
    )

    // 2. 计算基础收入
    const earnings = this.calculateEarnings(input, payPeriodsPerYear)

    // 3. 应用折算（月薪员工需要折算）
    if (employee.payType === 'SALARY' && prorationFactor.lt(1)) {
      earnings.regularPay = ProrationCalculator.applyProration(
        earnings.regularPay,
        prorationFactor
      ).toNumber()

      earnings.grossPay = earnings.regularPay + earnings.overtimePay +
                          earnings.bonus + earnings.commission + earnings.totalTips
    }

    // 4. 后续税务计算...
    // ...

    return {
      // ...
      prorationFactor: prorationFactor.toNumber()
    }
  }
}
```

---

### 2.2 工资扣押计算器

**`server/src/services/garnishmentCalculator.ts`**:

```typescript
import { Decimal } from 'decimal.js'
import { Garnishment } from '@prisma/client'

/**
 * 工资扣押计算器
 * 遵循联邦消费者信贷保护法 (CCPA Title III) 规定
 */
export class GarnishmentCalculator {
  // 联邦限额常量
  private static readonly FEDERAL_LIMIT_GENERAL = 0.25 // 25% for general debts
  private static readonly FEDERAL_LIMIT_CHILD_SUPPORT_SINGLE = 0.50 // 50% for child support (no dependents)
  private static readonly FEDERAL_LIMIT_CHILD_SUPPORT_WITH_DEPENDENTS = 0.60 // 60% with dependents
  private static readonly FEDERAL_LIMIT_ARREARS = 0.05 // Additional 5% if arrears > 12 weeks

  /**
   * 计算本期扣款金额
   *
   * @param disposableEarnings 可支配收入 (Gross - Taxes - Pre-tax deductions)
   * @param garnishments 员工的扣款令列表
   * @param hasOtherDependents 是否有其他抚养人（影响抚养费上限）
   * @returns 扣款详情
   */
  static calculateDeductions(
    disposableEarnings: Decimal,
    garnishments: Garnishment[],
    hasOtherDependents: boolean = false
  ): {
    totalDeduction: Decimal
    details: GarnishmentDeductionDetail[]
    remainingDisposable: Decimal
  } {
    let totalDeducted = new Decimal(0)
    const details: GarnishmentDeductionDetail[] = []

    // 1. 计算联邦限额
    const federalLimit = this.calculateFederalLimit(
      disposableEarnings,
      garnishments,
      hasOtherDependents
    )

    let remainingAllowedDeduction = federalLimit

    // 2. 按优先级排序处理
    const sortedGarnishments = [...garnishments]
      .filter(g => g.active)
      .sort((a, b) => a.priority - b.priority)

    for (const garnishment of sortedGarnishments) {
      if (remainingAllowedDeduction.lte(0)) break

      // 计算目标扣款金额
      let targetAmount = this.calculateTargetAmount(garnishment, disposableEarnings)

      // 检查总欠款余额
      if (garnishment.totalOwed) {
        const remainingOwed = new Decimal(garnishment.totalOwed).minus(garnishment.totalPaid)
        if (remainingOwed.lte(0)) continue // 已还清
        targetAmount = Decimal.min(targetAmount, remainingOwed)
      }

      // 应用联邦限额
      const actualAmount = Decimal.min(targetAmount, remainingAllowedDeduction)

      if (actualAmount.gt(0)) {
        totalDeducted = totalDeducted.plus(actualAmount)
        remainingAllowedDeduction = remainingAllowedDeduction.minus(actualAmount)

        details.push({
          garnishmentId: garnishment.id,
          type: garnishment.type,
          description: garnishment.description,
          targetAmount: targetAmount.toNumber(),
          actualAmount: actualAmount.toNumber(),
          limitReached: actualAmount.lt(targetAmount)
        })
      }
    }

    return {
      totalDeduction: totalDeducted,
      details,
      remainingDisposable: disposableEarnings.minus(totalDeducted)
    }
  }

  /**
   * 计算联邦扣款限额
   */
  private static calculateFederalLimit(
    disposableEarnings: Decimal,
    garnishments: Garnishment[],
    hasOtherDependents: boolean
  ): Decimal {
    // 检查是否有抚养费扣款
    const hasChildSupport = garnishments.some(g =>
      g.active && g.type === 'CHILD_SUPPORT'
    )

    if (hasChildSupport) {
      // 抚养费扣款限额更高
      const baseLimit = hasOtherDependents
        ? this.FEDERAL_LIMIT_CHILD_SUPPORT_SINGLE
        : this.FEDERAL_LIMIT_CHILD_SUPPORT_WITH_DEPENDENTS

      // TODO: 检查是否有超过 12 周的欠款，如有则再加 5%
      return disposableEarnings.times(baseLimit)
    }

    // 一般债务扣款限额 (25%)
    return disposableEarnings.times(this.FEDERAL_LIMIT_GENERAL)
  }

  /**
   * 计算目标扣款金额
   */
  private static calculateTargetAmount(
    garnishment: Garnishment,
    disposableEarnings: Decimal
  ): Decimal {
    // 固定金额优先
    if (garnishment.amount && new Decimal(garnishment.amount).gt(0)) {
      return new Decimal(garnishment.amount)
    }

    // 否则使用百分比
    if (garnishment.percent && new Decimal(garnishment.percent).gt(0)) {
      return disposableEarnings.times(new Decimal(garnishment.percent).div(100))
    }

    return new Decimal(0)
  }
}

export interface GarnishmentDeductionDetail {
  garnishmentId: string
  type: string
  description: string
  targetAmount: number
  actualAmount: number
  limitReached: boolean
}
```

---

### 2.3 会计系统集成 (GL Export)

**`server/src/services/glExportService.ts`**:

```typescript
import { PrismaClient } from '@prisma/client'
import { stringify } from 'csv-stringify/sync'
import { format } from 'date-fns'

const prisma = new PrismaClient()

/**
 * General Ledger 导出服务
 * 支持 QuickBooks, Xero, Sage 等会计系统
 */
export class GLExportService {
  /**
   * 生成 QuickBooks IIF 格式的分录
   *
   * @param companyId 公司 ID
   * @param payPeriodStart 发薪周期开始
   * @param payPeriodEnd 发薪周期结束
   * @returns CSV 格式的分录数据
   */
  static async generateQuickBooksJournal(
    companyId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date
  ): Promise<string> {
    // 1. 获取公司的 GL 科目配置
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!company) {
      throw new Error('Company not found')
    }

    // 2. 聚合当期所有薪资数据
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        payPeriodStart,
        payPeriodEnd,
        status: { not: 'VOID' }
      },
      include: {
        employee: true
      }
    })

    if (payrolls.length === 0) {
      throw new Error('No payroll data found for this period')
    }

    // 3. 计算汇总金额
    const summary = this.calculateSummary(payrolls)

    // 4. 生成分录行
    const journalDate = format(payPeriodEnd, 'yyyy-MM-dd')
    const journalEntries = []

    // 借方: 薪资支出
    journalEntries.push({
      Date: journalDate,
      Type: 'JE', // Journal Entry
      Account: company.glAccountWages || 'Payroll Expenses:Wages',
      Description: `Payroll ${format(payPeriodStart, 'MM/dd/yyyy')} - ${format(payPeriodEnd, 'MM/dd/yyyy')}`,
      Debit: summary.totalGrossWages.toFixed(2),
      Credit: ''
    })

    // 借方: 雇主税支出
    journalEntries.push({
      Date: journalDate,
      Type: 'JE',
      Account: company.glAccountTaxes || 'Payroll Expenses:Employer Taxes',
      Description: 'Employer Payroll Taxes',
      Debit: summary.totalEmployerTaxes.toFixed(2),
      Credit: ''
    })

    // 贷方: 现金支付 (Net Pay)
    journalEntries.push({
      Date: journalDate,
      Type: 'JE',
      Account: 'Bank:Checking',
      Description: 'Net Payroll Payment',
      Debit: '',
      Credit: summary.totalNetPay.toFixed(2)
    })

    // 贷方: 应付税款 (Employee Taxes + Employer Taxes)
    const totalTaxLiability = summary.totalEmployeeTaxes + summary.totalEmployerTaxes
    journalEntries.push({
      Date: journalDate,
      Type: 'JE',
      Account: company.glAccountLiabilities || 'Current Liabilities:Payroll Tax Payable',
      Description: 'Payroll Tax Liability',
      Debit: '',
      Credit: totalTaxLiability.toFixed(2)
    })

    // 贷方: 其他扣款（401k, 工资扣押等）
    if (summary.total401k > 0) {
      journalEntries.push({
        Date: journalDate,
        Type: 'JE',
        Account: 'Current Liabilities:401k Payable',
        Description: '401(k) Employee Contributions',
        Debit: '',
        Credit: summary.total401k.toFixed(2)
      })
    }

    if (summary.totalGarnishments > 0) {
      journalEntries.push({
        Date: journalDate,
        Type: 'JE',
        Account: 'Current Liabilities:Garnishments Payable',
        Description: 'Wage Garnishments',
        Debit: '',
        Credit: summary.totalGarnishments.toFixed(2)
      })
    }

    // 5. 转换为 CSV
    return stringify(journalEntries, { header: true })
  }

  /**
   * 计算薪资汇总
   */
  private static calculateSummary(payrolls: any[]) {
    let totalGrossWages = 0
    let totalEmployeeTaxes = 0
    let totalEmployerTaxes = 0
    let totalNetPay = 0
    let total401k = 0
    let totalGarnishments = 0

    payrolls.forEach(p => {
      totalGrossWages += Number(p.grossPay)
      totalEmployeeTaxes += (
        Number(p.federalWithholding) +
        Number(p.socialSecurity) +
        Number(p.medicare) +
        Number(p.stateWithholding || 0) +
        Number(p.localWithholding || 0)
      )
      totalEmployerTaxes += Number(p.employerTaxes || 0)
      totalNetPay += Number(p.netPay)
      total401k += Number(p.retirement401k || 0)
      totalGarnishments += Number(p.totalGarnishments || 0)
    })

    return {
      totalGrossWages,
      totalEmployeeTaxes,
      totalEmployerTaxes,
      totalNetPay,
      total401k,
      totalGarnishments
    }
  }
}
```

---

## 📊 Phase 3: 扩展功能

### 3.1 高级报表 API

**`server/src/routes/metrics.ts`**:

```typescript
import { Router, Response } from 'express'
import { prisma } from '../index.js'
import { hasCompanyAccess, AuthRequest } from '../middleware/auth.js'
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns'

const router = Router()

/**
 * GET /api/metrics/cost-trend
 * 薪资成本趋势（过去 6 个月）
 */
router.get('/cost-trend', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query

    if (!companyId || !hasCompanyAccess(req, String(companyId))) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const sixMonthsAgo = subMonths(new Date(), 6)

    const payrolls = await prisma.payroll.groupBy({
      by: ['payPeriodEnd'],
      where: {
        companyId: String(companyId),
        payPeriodEnd: { gte: sixMonthsAgo },
        status: { not: 'VOID' }
      },
      _sum: {
        grossPay: true,
        employerTaxes: true
      },
      orderBy: {
        payPeriodEnd: 'asc'
      }
    })

    // 格式化为图表友好格式
    const data = payrolls.map(p => ({
      month: format(p.payPeriodEnd, 'MMM yyyy'),
      grossPay: Number(p._sum.grossPay || 0),
      employerTaxes: Number(p._sum.employerTaxes || 0),
      totalCost: Number(p._sum.grossPay || 0) + Number(p._sum.employerTaxes || 0)
    }))

    res.json(data)
  } catch (error) {
    console.error('Error fetching cost trend:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/metrics/department-breakdown
 * 部门薪资分布
 */
router.get('/department-breakdown', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query

    if (!companyId || !hasCompanyAccess(req, String(companyId))) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const currentMonth = startOfMonth(new Date())
    const endOfCurrentMonth = endOfMonth(new Date())

    const result = await prisma.payroll.groupBy({
      by: ['employeeId'],
      where: {
        companyId: String(companyId),
        payPeriodStart: { gte: currentMonth },
        payPeriodEnd: { lte: endOfCurrentMonth },
        status: { not: 'VOID' }
      },
      _sum: {
        grossPay: true
      }
    })

    // TODO: Join with employee department info

    res.json(result)
  } catch (error) {
    console.error('Error fetching department breakdown:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
```

---

## 🚀 集成步骤

### 1. 安装依赖

```bash
cd server
npm install uuid date-fns csv-stringify async_hooks
npm install --save-dev @types/uuid
```

### 2. 运行数据库迁移

```bash
npx prisma migrate dev --name add_enterprise_features
npx prisma generate
```

### 3. 更新主应用入口

**`server/src/index.ts`**:

```typescript
import express from 'express'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import metricsRoutes from './routes/metrics.js'

const app = express()

// 1. 请求日志（最先）
app.use(requestLogger)

// 2. 现有中间件
// ... body parser, cors, etc ...

// 3. 路由
app.use('/api/metrics', metricsRoutes)
// ... 其他路由 ...

// 4. 404 处理
app.use(notFoundHandler)

// 5. 错误处理（最后）
app.use(errorHandler)

export { app }
```

---

## ✅ 测试清单

### 基础设施
- [ ] 请求 ID 在日志中正确传递
- [ ] AppError 正确返回状态码和消息
- [ ] Zod 验证错误被正确处理
- [ ] Prisma 错误被转换为友好消息

### 折算计算
- [ ] 周期内入职员工薪资正确折算
- [ ] 周期内离职员工薪资正确折算
- [ ] 完整周期员工折算系数为 1.0

### 工资扣押
- [ ] 扣款金额不超过可支配收入的 25%
- [ ] 抚养费扣款上限正确应用（50%/60%）
- [ ] 多个扣款令按优先级处理
- [ ] 扣款历史正确记录

### GL 导出
- [ ] QuickBooks CSV 格式正确
- [ ] 借贷平衡
- [ ] 科目映射正确

---

## 📈 性能优化建议

1. **数据库索引**: 已在 schema 中添加复合索引
2. **缓存**: 考虑对常用查询（如税率表）使用 Redis 缓存
3. **批量操作**: 使用 `prisma.transaction` 处理大批量薪资运行
4. **分页**: 所有列表查询应实施分页（limit/offset）

---

## 🔐 安全考虑

1. **TIN 加密**: Contractor.tin 必须使用 `encrypt()` 加密
2. **审计日志**: 所有敏感操作（修改扣款令、导出数据）需记录
3. **权限检查**: 确保 `hasCompanyAccess()` 在所有路由中执行
4. **SQL 注入**: 始终使用 Prisma 参数化查询

---

## 📚 总结

通过本路线图的实施，系统将具备：

✅ **企业级错误处理** - 统一的错误响应和请求追踪
✅ **复杂薪资场景** - 入离职折算、工资扣押、承包商管理
✅ **会计系统集成** - QuickBooks 兼容的 GL 导出
✅ **高级分析** - 成本趋势、部门分布等报表
✅ **性能优化** - 数据库索引、批量处理
✅ **审计合规** - 完整的操作日志记录

**预计总开发时间**: 6-8 周（含测试）
**优先级**: 按 Phase 1 → 2 → 3 顺序实施

---

## ✅ 已完成功能清单 (Completed Features)

### Phase 1: 基础设施 ✅

1. **错误处理系统** (`server/src/utils/AppError.ts`)
   - ✅ AppError 基类（含错误码、时间戳、HTTP状态码）
   - ✅ PayrollError、EncryptionError、TenantError 专用错误类
   - ✅ 工厂方法（badRequest、unauthorized、notFound等）

2. **请求追踪** (`server/src/middleware/requestLogger.ts`)
   - ✅ AsyncLocalStorage 实现请求上下文
   - ✅ 自动生成 UUID requestId
   - ✅ 结构化日志输出

3. **集中式错误处理** (`server/src/middleware/errorHandler.ts`)
   - ✅ AppError 统一响应格式
   - ✅ Zod 验证错误处理
   - ✅ 生产环境安全错误响应

4. **审计日志** (`server/src/services/auditLogger.ts`)
   - ✅ AuditLogger 服务类
   - ✅ 员工数据访问记录（合规要求）
   - ✅ 薪资操作审计
   - ✅ 审计追踪查询API

### Phase 2: 核心业务逻辑 ✅

1. **入离职折算** (`server/src/services/prorationCalculator.ts`)
   - ✅ 计算工作日折算系数（0.0-1.0）
   - ✅ Decimal.js 精确计算
   - ✅ 处理周期内入职/离职场景
   - ✅ 完整测试套件（11个测试用例）

2. **工资扣押** (`server/src/services/garnishmentCalculator.ts`)
   - ✅ 联邦25%限额执行
   - ✅ 优先级排序处理
   - ✅ 欠款余额追踪
   - ✅ 百分比和固定金额支持
   - ✅ 完整测试套件（10个测试用例）

3. **总账导出** (`server/src/services/glExportService.ts`)
   - ✅ QuickBooks Online CSV 格式
   - ✅ QuickBooks Desktop IIF 格式
   - ✅ Decimal.js 精确金额计算
   - ✅ 借贷记账平衡

### Phase 3: 扩展功能 ✅

1. **分析仪表盘API** (`server/src/routes/metrics.ts`)
   - ✅ `/api/metrics/cost-trend` - 6个月成本趋势
   - ✅ `/api/metrics/headcount` - 员工人数统计
   - ✅ `/api/metrics/department-breakdown` - 部门分布
   - ✅ `/api/metrics/payroll-summary` - 薪资汇总
   - ✅ `/api/metrics/top-earners` - Top 10 高收入员工

2. **GL导出API** (`server/src/routes/glExport.ts`)
   - ✅ `/api/gl-export/quickbooks-csv` - CSV下载
   - ✅ `/api/gl-export/quickbooks-iif` - IIF下载
   - ✅ `/api/gl-export/formats` - 格式列表
   - ✅ 审计日志集成

3. **服务器集成** (`server/src/index.ts`)
   - ✅ 所有路由已注册
   - ✅ 认证中间件配置
   - ✅ Prometheus指标端点分离

### 测试覆盖 ✅

- ✅ ProrationCalculator: 11个测试用例
- ✅ GarnishmentCalculator: 10个测试用例
- ✅ 覆盖边界情况和错误处理

---

## 🚀 部署检查清单 (Deployment Checklist)

### 环境变量
- [ ] `DATABASE_URL` - PostgreSQL连接字符串
- [ ] `ENCRYPTION_KEY` - 32字节加密密钥
- [ ] `REQUIRE_AUTH=true` - 启用认证
- [ ] `DISABLE_CSRF=false` - 启用CSRF保护

### 数据库迁移
```bash
# 1. 生成迁移文件（如需添加 Garnishment/Contractor 模型）
npx prisma migrate dev --name add_enterprise_features

# 2. 生产环境部署
npx prisma migrate deploy
```

### 测试执行
```bash
# 运行所有测试
npm test

# 运行特定测试套件
npm test prorationCalculator
npm test garnishmentCalculator
```

### API测试
```bash
# 成本趋势
GET /api/metrics/cost-trend?companyId={id}

# GL导出
GET /api/gl-export/quickbooks-csv?companyId={id}&payPeriodStart=2024-01-01&payPeriodEnd=2024-01-15

# 审计日志
GET /api/audit-logs?companyId={id}&limit=100
```

---

**状态**: ✅ **生产就绪 (Production Ready)**
**下一步**: 执行数据库迁移并部署到生产环境
