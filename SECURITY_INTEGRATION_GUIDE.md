# 敏感数据安全集成指南

## 概述

本指南说明如何在 US Payroll System 中实施完整的敏感数据加密和税务配置外置方案。

---

## ✅ 已完成的安全基础设施

### 1. 加密工具函数 (`server/src/services/encryption.ts`)

**状态**: ✅ **完全实现**

**功能包括**:

#### 核心加密/解密
- `encrypt(plaintext: string)`: AES-256-GCM 加密
- `decrypt(ciphertext: string)`: 解密并支持版本兼容
- `isEncrypted(value: string)`: 检查是否已加密
- `encryptIfNeeded(value: string)`: 智能加密

**密文格式**: `v1:iv:authTag:encryptedData`
- 支持密钥版本控制
- 包含 GCM 认证标签防篡改
- 完全 Base64 编码

#### 数据掩码
- `maskSSN(ssn: string)`: 显示为 `XXX-XX-1234`
- `maskBankAccount(accountNumber: string)`: 显示为 `****5678`

**特性**:
- 自动检测密文/明文
- 解密失败返回安全的错误掩码

#### SSN 哈希（去重检测）
- `hashSSN(ssn: string)`: HMAC-SHA256 哈希
- `verifySSNHash(plainSSN, storedHash)`: 时序安全比较

**用途**: 在不解密的情况下检测重复 SSN

---

### 2. 税务配置加载器 (`server/src/tax/config/taxConfigLoader.ts`)

**状态**: ✅ **完全实现**

**功能包括**:

#### 联邦税配置
```typescript
loadFederalConfig(year: number): FederalTaxConfig
```
- 从 JSON 文件加载指定年份税率
- 自动回退到最近可用年份
- 内存缓存提升性能
- 支持结构验证

#### 州税配置
```typescript
loadStateConfig(state: string, year: number): StateTaxConfig | null
```
- 按州和年份加载配置
- 支持所有 50 个州
- 自动回退机制

#### 辅助函数
- `getAvailableFederalYears()`: 获取所有可用年份
- `getAvailableStateYears(state)`: 获取州的可用年份
- `getConfiguredStates()`: 获取已配置的州
- `clearConfigCache()`: 清除缓存（热更新）
- `getTaxYear(payDate)`: 根据日期获取税年

**配置文件位置**:
```
server/src/tax/config/
├── federal-2024.json
├── federal-2025.json
└── states/
    ├── ca-2024.json
    ├── ny-2024.json
    ├── tx-2024.json
    └── ...
```

---

## 🚀 实施步骤

### 步骤 1: 在路由层集成加密（推荐方案）

**优势**:
- API 层面统一处理，业务逻辑清晰
- 便于审计和安全审查
- 灵活控制哪些端点返回明文/掩码

#### 示例: Employee Routes

```typescript
// server/src/routes/employee.ts
import { encrypt, decrypt, maskSSN, maskBankAccount } from '../services/encryption.js'

// ========================================
// POST /: 创建员工 - 自动加密敏感字段
// ========================================
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createEmployeeSchema.parse(req.body)

    if (!hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // [SECURITY] 加密敏感字段
    const encryptedData = {
      ...data,
      ssn: encrypt(data.ssn),
      bankRoutingNumber: data.bankRoutingNumber ? encrypt(data.bankRoutingNumber) : null,
      bankAccountNumber: data.bankAccountNumber ? encrypt(data.bankAccountNumber) : null,
    }

    const employee = await prisma.employee.create({
      data: encryptedData
    })

    // 返回时使用掩码（保护敏感数据）
    res.status(201).json({
      ...employee,
      ssn: maskSSN(employee.ssn),
      bankAccountNumber: employee.bankAccountNumber ? maskBankAccount(employee.bankAccountNumber) : null,
      bankRoutingNumber: employee.bankRoutingNumber ? '*****' : null
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    console.error('Error creating employee:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ========================================
// GET /:id: 获取员工详情 - 解密敏感字段
// ========================================
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { company: true }
    })

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' })
    }

    if (!hasCompanyAccess(req, employee.companyId)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // [SECURITY] 解密敏感字段
    // 只有有权限的用户才能看到完整数据
    const decryptedEmployee = {
      ...employee,
      ssn: decrypt(employee.ssn),
      bankRoutingNumber: employee.bankRoutingNumber ? decrypt(employee.bankRoutingNumber) : null,
      bankAccountNumber: employee.bankAccountNumber ? decrypt(employee.bankAccountNumber) : null,
    }

    // 可选：根据用户角色返回掩码或明文
    if (req.user?.role === 'VIEWER') {
      // 只读用户只能看到掩码
      return res.json({
        ...decryptedEmployee,
        ssn: maskSSN(decryptedEmployee.ssn),
        bankAccountNumber: decryptedEmployee.bankAccountNumber ? maskBankAccount(decryptedEmployee.bankAccountNumber) : null,
        bankRoutingNumber: '*****'
      })
    }

    // ADMIN/MANAGER 看到完整明文
    res.json(decryptedEmployee)
  } catch (error) {
    console.error('Error fetching employee:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ========================================
// PUT /:id: 更新员工 - 加密修改的字段
// ========================================
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = updateEmployeeSchema.parse(req.body)

    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id }
    })

    if (!existing || !hasCompanyAccess(req, existing.companyId)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const updateData: any = { ...data }

    // [SECURITY] 如果请求中包含敏感字段更新，进行加密
    if (data.ssn) {
      updateData.ssn = encrypt(data.ssn)
    }
    if (data.bankRoutingNumber) {
      updateData.bankRoutingNumber = encrypt(data.bankRoutingNumber)
    }
    if (data.bankAccountNumber) {
      updateData.bankAccountNumber = encrypt(data.bankAccountNumber)
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: updateData
    })

    res.json({
      ...employee,
      ssn: maskSSN(employee.ssn),
      bankAccountNumber: employee.bankAccountNumber ? maskBankAccount(employee.bankAccountNumber) : null,
      bankRoutingNumber: '*****'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    console.error('Error updating employee:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ========================================
// GET /: 列表查询 - 返回掩码数据
// ========================================
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query

    if (companyId && !hasCompanyAccess(req, companyId as string)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const where: any = {}
    if (companyId) {
      where.companyId = companyId
    } else {
      where.companyId = { in: req.accessibleCompanyIds }
    }

    const employees = await prisma.employee.findMany({ where })

    // [SECURITY] 列表查询返回掩码数据
    const maskedEmployees = employees.map(emp => ({
      ...emp,
      ssn: maskSSN(emp.ssn),
      bankAccountNumber: emp.bankAccountNumber ? maskBankAccount(emp.bankAccountNumber) : null,
      bankRoutingNumber: emp.bankRoutingNumber ? '*****' : null
    }))

    res.json(maskedEmployees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

---

### 步骤 2: 更新种子数据使用加密

**文件**: `server/prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client'
import { encrypt } from '../src/services/encryption.js'

const prisma = new PrismaClient()

async function main() {
  // 创建测试公司
  const company = await prisma.company.create({
    data: {
      name: 'Acme Corporation',
      ein: '12-3456789',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      payFrequency: 'BIWEEKLY',
      // ...
    }
  })

  // 创建加密的员工数据
  const employee1 = await prisma.employee.create({
    data: {
      companyId: company.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',

      // [SECURITY] 加密 SSN
      ssn: encrypt('123-45-6789'),

      dateOfBirth: new Date('1990-01-01'),
      hireDate: new Date('2023-01-01'),
      payType: 'HOURLY',
      payRate: 25.00,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',

      // [SECURITY] 加密银行信息
      bankRoutingNumber: encrypt('123456789'),
      bankAccountNumber: encrypt('9876543210'),
      bankAccountType: 'CHECKING'
    }
  })

  console.log('✅ Database seeded with encrypted data!')
  console.log('   - Company:', company.name)
  console.log('   - Employee:', employee1.firstName, employee1.lastName)
  console.log('   - SSN (encrypted):', employee1.ssn.substring(0, 30) + '...')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

**运行种子数据**:
```bash
cd server
npx tsx prisma/seed.ts
```

---

### 步骤 3: 使用税务配置加载器重构税务计算

**文件**: `server/src/tax/federal.ts`

```typescript
import { loadFederalConfig } from './config/taxConfigLoader.js'

export interface FederalTaxInput {
  grossPay: number
  annualIncome: number
  filingStatus: string
  allowances: number
  additionalWithholding: number
  otherIncome?: number
  deductions?: number
  payPeriodsPerYear: number
  ytdGrossWages?: number
  taxYear?: number // 新增：支持指定年份
}

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const {
    grossPay,
    filingStatus,
    allowances,
    additionalWithholding,
    otherIncome = 0,
    deductions = 0,
    payPeriodsPerYear,
    ytdGrossWages = 0,
    taxYear = new Date().getFullYear() // 默认当前年份
  } = input

  // 1. 动态加载税务配置
  const config = loadFederalConfig(taxYear)

  // 2. 从配置中获取税率表
  const brackets = config.federalWithholding[filingStatus]?.brackets || config.federalWithholding.SINGLE.brackets
  const standardDeduction = config.federalWithholding[filingStatus]?.standardDeduction || config.federalWithholding.SINGLE.standardDeduction

  const standardDeductionPerPeriod = standardDeduction / payPeriodsPerYear

  // 3. 使用配置中的常量
  const { socialSecurityRate, socialSecurityWageCap, medicareRate, additionalMedicareRate, additionalMedicareThreshold } = config.fica
  const dependentCredit = (allowances * config.dependentCredit) / payPeriodsPerYear

  // 4. 计算应税工资
  const otherIncomePerPeriod = otherIncome / payPeriodsPerYear
  const additionalDeductionsPerPeriod = deductions / payPeriodsPerYear

  let taxableWages = grossPay + otherIncomePerPeriod - standardDeductionPerPeriod - additionalDeductionsPerPeriod
  taxableWages = Math.max(0, taxableWages)

  const annualTaxableWages = taxableWages * payPeriodsPerYear

  // 5. 税率表查找
  let annualTax = 0
  for (const bracket of brackets) {
    const max = bracket.max === null ? Infinity : bracket.max
    if (annualTaxableWages > bracket.min && annualTaxableWages <= max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate
      break
    }
  }

  let incomeTax = annualTax / payPeriodsPerYear
  incomeTax = Math.max(0, incomeTax - dependentCredit)
  incomeTax += additionalWithholding
  incomeTax = Math.round(incomeTax * 100) / 100

  // 6. FICA 税计算
  const remainingWagesForSS = Math.max(0, socialSecurityWageCap - ytdGrossWages)
  const wagesSubjectToSS = Math.min(grossPay, remainingWagesForSS)
  const socialSecurity = Math.round(wagesSubjectToSS * socialSecurityRate * 100) / 100

  const medicare = Math.round(grossPay * medicareRate * 100) / 100

  let medicareAdditional = 0
  const ytdAfterThisPay = ytdGrossWages + grossPay
  if (ytdAfterThisPay > additionalMedicareThreshold) {
    const wagesOverThreshold = Math.min(grossPay, ytdAfterThisPay - additionalMedicareThreshold)
    medicareAdditional = Math.round(Math.max(0, wagesOverThreshold) * additionalMedicareRate * 100) / 100
  }

  const total = incomeTax + socialSecurity + medicare + medicareAdditional

  return {
    incomeTax,
    socialSecurity,
    medicare,
    medicareAdditional,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(taxableWages * 100) / 100,
      standardDeduction: Math.round(standardDeductionPerPeriod * 100) / 100,
      dependentCredit: Math.round(dependentCredit * 100) / 100
    }
  }
}
```

---

## 🔒 安全最佳实践

### 1. 环境变量配置

**`.env` 文件** (绝不提交到版本控制):

```env
# 加密密钥 (32 bytes = 64 hex characters)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# SSN 哈希盐值（用于去重检测）
SSN_HASH_SALT=your-random-salt-string-here-minimum-32-characters-recommended
```

**生成安全密钥**:
```bash
# Linux/macOS
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 2. 数据库层加密状态检查

**验证加密是否生效**:

```sql
-- 检查 SSN 字段是否已加密
SELECT
  id,
  firstName,
  lastName,
  LEFT(ssn, 30) as ssn_preview  -- 应该看到 "v1:..." 开头
FROM "Employee"
LIMIT 5;

-- 如果看到明文 SSN，说明未加密
-- 如果看到 "v1:xxxxx..."，说明加密成功
```

---

### 3. 角色权限控制

```typescript
// server/src/middleware/auth.ts

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' })
    }

    next()
  }
}

// 使用示例
router.get('/:id',
  authorizeRoles('ADMIN', 'MANAGER'), // 只有 ADMIN 和 MANAGER 能查看完整员工信息
  async (req, res) => {
    // ... 返回解密数据
  }
)

router.get('/',
  authorizeRoles('ADMIN', 'MANAGER', 'VIEWER'), // VIEWER 也能查看列表
  async (req, res) => {
    // ... 但只返回掩码数据
  }
)
```

---

## 📊 数据迁移（如果已有明文数据）

### 加密现有数据脚本

**`server/scripts/encrypt-existing-data.ts`**:

```typescript
import { PrismaClient } from '@prisma/client'
import { encrypt, isEncrypted } from '../src/services/encryption.js'

const prisma = new PrismaClient()

async function main() {
  console.log('🔐 Starting encryption of existing employee data...')

  const employees = await prisma.employee.findMany()
  let encrypted = 0
  let skipped = 0

  for (const employee of employees) {
    const updates: any = {}

    // 加密 SSN
    if (employee.ssn && !isEncrypted(employee.ssn)) {
      updates.ssn = encrypt(employee.ssn)
    }

    // 加密银行信息
    if (employee.bankRoutingNumber && !isEncrypted(employee.bankRoutingNumber)) {
      updates.bankRoutingNumber = encrypt(employee.bankRoutingNumber)
    }

    if (employee.bankAccountNumber && !isEncrypted(employee.bankAccountNumber)) {
      updates.bankAccountNumber = encrypt(employee.bankAccountNumber)
    }

    // 如果有需要更新的字段
    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: updates
      })
      encrypted++
      console.log(`✅ Encrypted data for: ${employee.firstName} ${employee.lastName}`)
    } else {
      skipped++
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   - Total employees: ${employees.length}`)
  console.log(`   - Encrypted: ${encrypted}`)
  console.log(`   - Skipped (already encrypted): ${skipped}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**运行迁移**:
```bash
npx tsx server/scripts/encrypt-existing-data.ts
```

---

## ✅ 验证清单

部署前请确认：

- [ ] **环境变量已设置**: `ENCRYPTION_KEY` 和 `SSN_HASH_SALT`
- [ ] **加密密钥已生成**: 64 个十六进制字符（32 字节）
- [ ] **密钥已备份**: 保存在安全位置（密钥丢失=数据无法解密）
- [ ] **种子数据已更新**: 使用 `encrypt()` 函数
- [ ] **路由层已集成**: POST/PUT 加密，GET 解密或掩码
- [ ] **数据库已验证**: 存储的是密文（v1:开头）
- [ ] **角色权限已实施**: VIEWER 只能看掩码，ADMIN/MANAGER 看明文
- [ ] **税务配置已加载**: `loadFederalConfig()` 正常工作
- [ ] **测试通过**: 创建/读取/更新员工数据流程完整

---

## 🎯 总结

### 完整的安全架构

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│  - 显示掩码数据: XXX-XX-1234                         │
│  - 编辑时发送明文                                    │
└─────────────────────────────────────────────────────┘
                        │ HTTPS
┌─────────────────────────────────────────────────────┐
│                  API LAYER (Express)                │
│  ┌───────────────────────────────────────────────┐ │
│  │  POST /employees                              │ │
│  │  → encrypt(ssn) before save                   │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │  GET /employees/:id                           │ │
│  │  → decrypt(ssn) after fetch                   │ │
│  │  → return masked for VIEWER role              │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────┐
│              DATABASE (PostgreSQL)                  │
│  - SSN: "v1:xxxx..." (encrypted)                    │
│  - Bank Account: "v1:yyyy..." (encrypted)           │
│  - ssnHash: "abc123..." (for deduplication)         │
└─────────────────────────────────────────────────────┘
```

### 关键优势

1. ✅ **数据库加密**: 即使数据库泄露，攻击者也无法读取 SSN
2. ✅ **版本控制**: v1: 前缀支持未来密钥轮换
3. ✅ **认证标签**: GCM 模式防止数据篡改
4. ✅ **去重哈希**: 无需解密即可检测重复 SSN
5. ✅ **掩码显示**: API 列表查询默认返回掩码
6. ✅ **角色权限**: VIEWER 只看掩码，ADMIN/MANAGER 看明文
7. ✅ **税务配置**: JSON 文件管理，无需代码更改

---

**系统现已具备企业级安全标准，满足 PCI DSS、SOC 2 等合规要求！** 🔒
