@echo off
REM PostgreSQL Setup Script for US Payroll System
REM This script creates the payroll_db database

echo ========================================
echo PostgreSQL Database Setup
echo ========================================
echo.

set PGPATH=C:\Program Files\PostgreSQL\18\bin
set PGPASSWORD=%1

if "%PGPASSWORD%"=="" (
    echo Error: Please provide PostgreSQL password as argument
    echo Usage: setup-postgres.bat YOUR_POSTGRES_PASSWORD
    echo.
    echo Example: setup-postgres.bat mypassword123
    exit /b 1
)

echo Creating database 'payroll_db'...
"%PGPATH%\psql.exe" -U postgres -c "CREATE DATABASE payroll_db;" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Database 'payroll_db' created successfully
) else (
    echo [INFO] Database may already exist or there was an error
    "%PGPATH%\psql.exe" -U postgres -c "SELECT datname FROM pg_database WHERE datname='payroll_db';"
)

echo.
echo Verifying database...
"%PGPATH%\psql.exe" -U postgres -d payroll_db -c "SELECT version();" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Successfully connected to payroll_db
    echo.
    echo ========================================
    echo Setup Complete!
    echo ========================================
    echo.
    echo Your DATABASE_URL should be:
    echo postgresql://postgres:%PGPASSWORD%@localhost:5432/payroll_db
    echo.
    echo Next steps:
    echo 1. Update server/.env with the DATABASE_URL above
    echo 2. Run: npm run db:migrate
    echo.
) else (
    echo [ERROR] Could not connect to database
    exit /b 1
)
