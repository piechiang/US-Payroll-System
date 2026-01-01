@echo off
REM Enterprise Features Database Migration Script (Windows)
REM This script creates and applies the database migration for enterprise features

echo ================================
echo Enterprise Features Migration
echo ================================
echo.

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ERROR: DATABASE_URL environment variable is not set
    echo Please set DATABASE_URL in your .env file or set it:
    echo   set DATABASE_URL=postgresql://user:pass@localhost:5432/payroll
    exit /b 1
)

echo DATABASE_URL is set
echo.

REM Check if this is production
if "%NODE_ENV%"=="production" (
    echo WARNING: PRODUCTION ENVIRONMENT DETECTED
    echo This will modify your production database!
    set /p confirm="Are you sure you want to continue? (yes/no): "
    if /i not "%confirm%"=="yes" (
        echo Migration cancelled
        exit /b 1
    )
    echo.
)

REM Step 1: Generate Prisma Client
echo Step 1: Generating Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo ERROR: Failed to generate Prisma Client
    exit /b 1
)
echo Prisma Client generated
echo.

REM Step 2: Create or apply migration
if not "%NODE_ENV%"=="production" (
    echo Step 2: Creating migration...
    call npx prisma migrate dev --name add_enterprise_features_auditlog
    if errorlevel 1 (
        echo ERROR: Failed to create migration
        exit /b 1
    )
    echo Migration created and applied
) else (
    echo Step 2: Applying migration (production)...
    call npx prisma migrate deploy
    if errorlevel 1 (
        echo ERROR: Failed to apply migration
        exit /b 1
    )
    echo Migration applied
)
echo.

REM Step 3: Check migration status
echo Step 3: Checking migration status...
call npx prisma migrate status
echo.

echo ================================
echo Migration Complete!
echo ================================
echo.
echo New models added:
echo   - AuditLog (updated schema)
echo   - Garnishment (already existed)
echo   - Contractor (already existed)
echo.
echo Indexes optimized:
echo   - AuditLog: userId, companyId, action, entity, entityId, timestamp
echo   - Payroll: companyId + payPeriodStart + payPeriodEnd (composite)
echo.
echo Next steps:
echo   1. Test the new API endpoints
echo   2. Run the test suite: npm test
echo   3. Deploy to production
echo.
