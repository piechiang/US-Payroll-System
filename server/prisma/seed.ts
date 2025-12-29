import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log('Created admin user:', admin.email);

  // Create test companies
  const company1 = await prisma.company.upsert({
    where: { ein: '12-3456789' },
    update: {},
    create: {
      name: 'Acme Tech Solutions',
      ein: '12-3456789',
      address: '123 Innovation Drive',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      phone: '(415) 555-0100',
      email: 'hr@acmetech.com',
      payFrequency: 'BIWEEKLY',
    },
  });
  console.log('Created company:', company1.name);

  const company2 = await prisma.company.upsert({
    where: { ein: '98-7654321' },
    update: {},
    create: {
      name: 'Lone Star Consulting',
      ein: '98-7654321',
      address: '456 Main Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      phone: '(512) 555-0200',
      email: 'payroll@lonestar.com',
      payFrequency: 'BIWEEKLY',
    },
  });
  console.log('Created company:', company2.name);

  const company3 = await prisma.company.upsert({
    where: { ein: '55-1234567' },
    update: {},
    create: {
      name: 'Sunshine Services LLC',
      ein: '55-1234567',
      address: '789 Beach Blvd',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      phone: '(305) 555-0300',
      email: 'admin@sunshineservices.com',
      payFrequency: 'WEEKLY',
    },
  });
  console.log('Created company:', company3.name);

  // Create employees for Acme Tech (California - has state tax)
  const employees1 = [
    {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@acmetech.com',
      ssn: '123-45-6789',
      dateOfBirth: new Date('1985-03-15'),
      hireDate: new Date('2022-01-10'),
      department: 'Engineering',
      jobTitle: 'Senior Software Engineer',
      payType: 'SALARY',
      payRate: 150000,
      filingStatus: 'MARRIED_FILING_JOINTLY',
      allowances: 2,
      address: '100 Market St, Apt 5',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
    },
    {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@acmetech.com',
      ssn: '234-56-7890',
      dateOfBirth: new Date('1990-07-22'),
      hireDate: new Date('2023-03-01'),
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      payType: 'SALARY',
      payRate: 120000,
      filingStatus: 'SINGLE',
      allowances: 0,
      address: '200 Valencia St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94110',
    },
    {
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@acmetech.com',
      ssn: '345-67-8901',
      dateOfBirth: new Date('1988-11-30'),
      hireDate: new Date('2021-06-15'),
      department: 'Design',
      jobTitle: 'UX Designer',
      payType: 'SALARY',
      payRate: 110000,
      filingStatus: 'SINGLE',
      allowances: 0,
      address: '300 Folsom St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94107',
    },
    {
      firstName: 'Emily',
      lastName: 'Davis',
      email: 'emily.davis@acmetech.com',
      ssn: '456-78-9012',
      dateOfBirth: new Date('1995-02-14'),
      hireDate: new Date('2024-01-08'),
      department: 'Support',
      jobTitle: 'Customer Support Rep',
      payType: 'HOURLY',
      payRate: 28.50,
      filingStatus: 'SINGLE',
      allowances: 0,
      address: '400 Howard St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
    },
  ];

  for (const emp of employees1) {
    await prisma.employee.upsert({
      where: { id: `emp-${emp.ssn.replace(/-/g, '')}` },
      update: {},
      create: {
        id: `emp-${emp.ssn.replace(/-/g, '')}`,
        companyId: company1.id,
        ...emp,
      },
    });
    console.log(`Created employee: ${emp.firstName} ${emp.lastName} (${company1.name})`);
  }

  // Create employees for Lone Star Consulting (Texas - no state tax)
  const employees2 = [
    {
      firstName: 'Robert',
      lastName: 'Williams',
      email: 'robert.williams@lonestar.com',
      ssn: '567-89-0123',
      dateOfBirth: new Date('1980-05-20'),
      hireDate: new Date('2019-08-01'),
      department: 'Consulting',
      jobTitle: 'Senior Consultant',
      payType: 'SALARY',
      payRate: 130000,
      filingStatus: 'MARRIED_FILING_JOINTLY',
      allowances: 3,
      address: '500 Congress Ave',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
    },
    {
      firstName: 'Jennifer',
      lastName: 'Martinez',
      email: 'jennifer.martinez@lonestar.com',
      ssn: '678-90-1234',
      dateOfBirth: new Date('1992-09-10'),
      hireDate: new Date('2023-05-15'),
      department: 'Consulting',
      jobTitle: 'Consultant',
      payType: 'SALARY',
      payRate: 95000,
      filingStatus: 'HEAD_OF_HOUSEHOLD',
      allowances: 1,
      address: '600 Lamar Blvd',
      city: 'Austin',
      state: 'TX',
      zipCode: '78703',
    },
  ];

  for (const emp of employees2) {
    await prisma.employee.upsert({
      where: { id: `emp-${emp.ssn.replace(/-/g, '')}` },
      update: {},
      create: {
        id: `emp-${emp.ssn.replace(/-/g, '')}`,
        companyId: company2.id,
        ...emp,
      },
    });
    console.log(`Created employee: ${emp.firstName} ${emp.lastName} (${company2.name})`);
  }

  // Create employees for Sunshine Services (Florida - no state tax)
  const employees3 = [
    {
      firstName: 'David',
      lastName: 'Brown',
      email: 'david.brown@sunshineservices.com',
      ssn: '789-01-2345',
      dateOfBirth: new Date('1975-12-05'),
      hireDate: new Date('2018-02-20'),
      department: 'Operations',
      jobTitle: 'Operations Manager',
      payType: 'SALARY',
      payRate: 85000,
      filingStatus: 'MARRIED_FILING_JOINTLY',
      allowances: 4,
      address: '700 Ocean Drive',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
    },
    {
      firstName: 'Lisa',
      lastName: 'Garcia',
      email: 'lisa.garcia@sunshineservices.com',
      ssn: '890-12-3456',
      dateOfBirth: new Date('1998-04-25'),
      hireDate: new Date('2024-06-01'),
      department: 'Operations',
      jobTitle: 'Service Technician',
      payType: 'HOURLY',
      payRate: 22.00,
      filingStatus: 'SINGLE',
      allowances: 0,
      address: '800 Collins Ave',
      city: 'Miami Beach',
      state: 'FL',
      zipCode: '33140',
    },
  ];

  for (const emp of employees3) {
    await prisma.employee.upsert({
      where: { id: `emp-${emp.ssn.replace(/-/g, '')}` },
      update: {},
      create: {
        id: `emp-${emp.ssn.replace(/-/g, '')}`,
        companyId: company3.id,
        ...emp,
      },
    });
    console.log(`Created employee: ${emp.firstName} ${emp.lastName} (${company3.name})`);
  }

  // Grant admin access to all companies
  for (const company of [company1, company2, company3]) {
    await prisma.companyAccess.upsert({
      where: {
        userId_companyId: {
          userId: admin.id,
          companyId: company.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        companyId: company.id,
        role: 'ADMIN',
      },
    });
  }

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log('   - 1 Admin user (admin@example.com / admin123)');
  console.log('   - 3 Companies');
  console.log('   - 8 Employees total');
  console.log('\n🏢 Companies:');
  console.log('   1. Acme Tech Solutions (CA) - 4 employees');
  console.log('   2. Lone Star Consulting (TX) - 2 employees');
  console.log('   3. Sunshine Services LLC (FL) - 2 employees');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
