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
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "workState" TEXT,
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
    "grossPay" DECIMAL NOT NULL,
    "federalWithholding" DECIMAL NOT NULL,
    "socialSecurity" DECIMAL NOT NULL,
    "medicare" DECIMAL NOT NULL,
    "stateWithholding" DECIMAL NOT NULL DEFAULT 0,
    "stateDisability" DECIMAL NOT NULL DEFAULT 0,
    "stateUnemployment" DECIMAL NOT NULL DEFAULT 0,
    "localWithholding" DECIMAL NOT NULL DEFAULT 0,
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_access_userId_companyId_key" ON "company_access"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_ein_key" ON "companies"("ein");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_lastName_firstName_idx" ON "employees"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "pay_periods_companyId_startDate_idx" ON "pay_periods"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "payrolls_employeeId_payDate_idx" ON "payrolls"("employeeId", "payDate");

-- CreateIndex
CREATE INDEX "payrolls_companyId_payDate_idx" ON "payrolls"("companyId", "payDate");
