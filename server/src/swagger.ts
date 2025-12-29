import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'US Payroll System API',
      version: '1.0.0',
      description: `
A comprehensive payroll management API for US businesses.

## Features
- Employee management with encrypted PII (SSN, bank accounts)
- Multi-state tax calculations (40+ states supported)
- Federal, state, and local tax withholding
- Employer tax calculations (FUTA, SUTA, FICA)
- Payroll processing with audit logging
- Multi-tenant company support
- Role-based access control (ADMIN, ACCOUNTANT, MANAGER, VIEWER)

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`Authorization: Bearer <token>\`

## CSRF Protection
State-changing requests (POST, PUT, DELETE) require a CSRF token:
1. GET /api/csrf-token to obtain a token
2. Include the token in the X-CSRF-Token header

## Rate Limiting
- General API: 100 requests per 15 minutes
- Login: 5 attempts per 15 minutes
- Registration: 3 per hour
- Payroll run: 10 per hour
      `,
      contact: {
        name: 'API Support'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type/code'
            },
            message: {
              type: 'string',
              description: 'Human-readable error message'
            },
            reference: {
              type: 'string',
              description: 'Error reference ID for support'
            },
            details: {
              type: 'array',
              description: 'Validation error details',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 50 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 2 },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' }
          }
        },
        Employee: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            ssn: { type: 'string', description: 'Masked SSN (XXX-XX-1234)' },
            dateOfBirth: { type: 'string', format: 'date' },
            hireDate: { type: 'string', format: 'date' },
            department: { type: 'string' },
            jobTitle: { type: 'string' },
            payType: { type: 'string', enum: ['HOURLY', 'SALARY'] },
            payRate: { type: 'number' },
            filingStatus: {
              type: 'string',
              enum: ['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD']
            },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string', maxLength: 2 },
            zipCode: { type: 'string' },
            isActive: { type: 'boolean' }
          }
        },
        Company: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            ein: { type: 'string', description: 'Employer ID (XX-XXXXXXX)' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string', maxLength: 2 },
            zipCode: { type: 'string' },
            payFrequency: { type: 'string', enum: ['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'] },
            isActive: { type: 'boolean' }
          }
        },
        PayrollResult: {
          type: 'object',
          properties: {
            employee: { $ref: '#/components/schemas/Employee' },
            earnings: {
              type: 'object',
              properties: {
                regularPay: { type: 'number' },
                overtimePay: { type: 'number' },
                bonus: { type: 'number' },
                commission: { type: 'number' },
                grossPay: { type: 'number' }
              }
            },
            taxes: {
              type: 'object',
              properties: {
                federal: {
                  type: 'object',
                  properties: {
                    incomeTax: { type: 'number' },
                    socialSecurity: { type: 'number' },
                    medicare: { type: 'number' }
                  }
                },
                state: {
                  type: 'object',
                  properties: {
                    incomeTax: { type: 'number' },
                    sdi: { type: 'number' }
                  }
                },
                local: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' }
                  }
                }
              }
            },
            netPay: { type: 'number' },
            totalDeductions: { type: 'number' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER'] }
          }
        }
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'AUTHENTICATION_ERROR', message: 'No token provided' }
            }
          }
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'AUTHORIZATION_ERROR', message: 'Access denied' }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'NOT_FOUND', message: 'Employee not found' }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                error: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [{ field: 'email', message: 'Invalid email format' }]
              }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
