-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "company_access" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ein" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "payFrequency" TEXT NOT NULL DEFAULT 'BIWEEKLY',
    "stateUnemploymentId" TEXT,
    "stateWithholdingId" TEXT,
    "sutaRate" DECIMAL,
    "federalDepositSchedule" TEXT NOT NULL DEFAULT 'MONTHLY',
    "retirement401kMatchRate" DECIMAL,
    "retirement401kMatchLimitPercent" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ssn" TEXT NOT NULL,
    "ssnHash" TEXT,
    "dateOfBirth" DATETIME NOT NULL,
    "hireDate" DATETIME NOT NULL,
    "terminationDate" DATETIME,
    "department" TEXT,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payType" TEXT NOT NULL,
    "payRate" DECIMAL NOT NULL,
    "filingStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "allowances" INTEGER NOT NULL DEFAULT 0,
    "additionalWithholding" DECIMAL NOT NULL DEFAULT 0,
    "otherIncome" DECIMAL NOT NULL DEFAULT 0,
    "deductions" DECIMAL NOT NULL DEFAULT 0,
    "retirement401kType" TEXT,
    "retirement401kRate" DECIMAL,
    "retirement401kAmount" DECIMAL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "workState" TEXT,
    "workCity" TEXT,
    "localResident" BOOLEAN NOT NULL DEFAULT true,
    "bankRoutingNumber" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "payDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedBy" TEXT,
    "submittedAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "rejectionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pay_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payPeriodId" TEXT,
    "payPeriodStart" DATETIME NOT NULL,
    "payPeriodEnd" DATETIME NOT NULL,
    "payDate" DATETIME NOT NULL,
    "regularHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "regularPay" DECIMAL NOT NULL,
    "overtimePay" DECIMAL NOT NULL DEFAULT 0,
    "bonus" DECIMAL NOT NULL DEFAULT 0,
    "commission" DECIMAL NOT NULL DEFAULT 0,
    "creditCardTips" DECIMAL NOT NULL DEFAULT 0,
    "cashTips" DECIMAL NOT NULL DEFAULT 0,
    "grossPay" DECIMAL NOT NULL,
    "federalWithholding" DECIMAL NOT NULL,
    "socialSecurity" DECIMAL NOT NULL,
    "medicare" DECIMAL NOT NULL,
    "stateWithholding" DECIMAL NOT NULL DEFAULT 0,
    "stateDisability" DECIMAL NOT NULL DEFAULT 0,
    "stateUnemployment" DECIMAL NOT NULL DEFAULT 0,
    "localWithholding" DECIMAL NOT NULL DEFAULT 0,
    "employerFuta" DECIMAL NOT NULL DEFAULT 0,
    "employerSuta" DECIMAL NOT NULL DEFAULT 0,
    "employerSocialSecurity" DECIMAL NOT NULL DEFAULT 0,
    "employerMedicare" DECIMAL NOT NULL DEFAULT 0,
    "totalEmployerTax" DECIMAL NOT NULL DEFAULT 0,
    "employer401kMatch" DECIMAL NOT NULL DEFAULT 0,
    "retirement401k" DECIMAL NOT NULL DEFAULT 0,
    "healthInsurance" DECIMAL NOT NULL DEFAULT 0,
    "hsaContribution" DECIMAL NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL NOT NULL DEFAULT 0,
    "garnishments" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL,
    "netPay" DECIMAL NOT NULL,
    "reimbursements" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "ytdGrossPay" DECIMAL NOT NULL DEFAULT 0,
    "ytdFederalTax" DECIMAL NOT NULL DEFAULT 0,
    "ytdSocialSecurity" DECIMAL NOT NULL DEFAULT 0,
    "ytdMedicare" DECIMAL NOT NULL DEFAULT 0,
    "ytdStateTax" DECIMAL NOT NULL DEFAULT 0,
    "ytdNetPay" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payrolls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payrolls_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "companyId" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "payroll_locks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "payPeriodStart" DATETIME NOT NULL,
    "payPeriodEnd" DATETIME NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "lockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "w2_forms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "wagesTipsOther" DECIMAL NOT NULL,
    "federalWithholding" DECIMAL NOT NULL,
    "socialSecurityWages" DECIMAL NOT NULL,
    "socialSecurityTax" DECIMAL NOT NULL,
    "medicareWages" DECIMAL NOT NULL,
    "medicareTax" DECIMAL NOT NULL,
    "socialSecurityTips" DECIMAL NOT NULL DEFAULT 0,
    "allocatedTips" DECIMAL NOT NULL DEFAULT 0,
    "dependentCareBenefits" DECIMAL NOT NULL DEFAULT 0,
    "nonqualifiedPlans" DECIMAL NOT NULL DEFAULT 0,
    "box12Codes" TEXT,
    "statutoryEmployee" BOOLEAN NOT NULL DEFAULT false,
    "retirementPlan" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartySickPay" BOOLEAN NOT NULL DEFAULT false,
    "box14Other" TEXT,
    "stateCode" TEXT,
    "stateEmployerId" TEXT,
    "stateWages" DECIMAL NOT NULL DEFAULT 0,
    "stateWithholding" DECIMAL NOT NULL DEFAULT 0,
    "localWages" DECIMAL NOT NULL DEFAULT 0,
    "localWithholding" DECIMAL NOT NULL DEFAULT 0,
    "localityName" TEXT,
    "state2Code" TEXT,
    "state2EmployerId" TEXT,
    "state2Wages" DECIMAL NOT NULL DEFAULT 0,
    "state2Withholding" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "controlNumber" TEXT,
    "generatedAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "w2_forms_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "w2_forms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_access_userId_companyId_key" ON "company_access"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_ein_key" ON "companies"("ein");

-- CreateIndex
CREATE UNIQUE INDEX "employees_ssnHash_key" ON "employees"("ssnHash");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_lastName_firstName_idx" ON "employees"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "pay_periods_companyId_startDate_idx" ON "pay_periods"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "pay_periods_status_idx" ON "pay_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_employeeId_payPeriodStart_payPeriodEnd_key" ON "payrolls"("employeeId", "payPeriodStart", "payPeriodEnd");

-- CreateIndex
CREATE INDEX "payrolls_employeeId_payDate_idx" ON "payrolls"("employeeId", "payDate");

-- CreateIndex
CREATE INDEX "payrolls_companyId_payDate_idx" ON "payrolls"("companyId", "payDate");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_locks_idempotencyKey_key" ON "payroll_locks"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_locks_companyId_payPeriodStart_payPeriodEnd_status_key" ON "payroll_locks"("companyId", "payPeriodStart", "payPeriodEnd", "status");

-- CreateIndex
CREATE INDEX "payroll_locks_expiresAt_idx" ON "payroll_locks"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "w2_forms_employeeId_taxYear_key" ON "w2_forms"("employeeId", "taxYear");

-- CreateIndex
CREATE INDEX "w2_forms_companyId_taxYear_idx" ON "w2_forms"("companyId", "taxYear");
