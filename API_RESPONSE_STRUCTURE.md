# API Response Structure Guide

## Overview

This document defines the standard response structures used across the payroll system API to ensure consistency between frontend and backend.

## Standard Response Formats

### Paginated List Response

All list endpoints that support pagination return data in this format:

```typescript
{
  data: T[],           // Array of items
  pagination: {
    page: number,      // Current page number (1-based)
    limit: number,     // Items per page
    total: number,     // Total number of items
    totalPages: number,// Total number of pages
    hasNext: boolean,  // Whether there's a next page
    hasPrev: boolean   // Whether there's a previous page
  }
}
```

### Single Item Response

Endpoints that return a single item return the item directly:

```typescript
T  // The item object
```

### Error Response

All error responses follow this format:

```typescript
{
  error: string,        // Error type or code
  message: string,      // Human-readable error message
  details?: any         // Optional additional error details
}
```

## Endpoints by Response Type

### Paginated Endpoints

These endpoints return `{ data: T[], pagination: {...} }`:

#### **GET /api/employees**

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 50, max: 100)
- `companyId` (string, optional): Filter by company ID
- `search` (string, optional): Search by name, email, department, or job title

**Response:**
```typescript
{
  data: Employee[],
  pagination: PaginationInfo
}
```

**Frontend Usage:**
```typescript
// ❌ WRONG - Treating response as array
const { data: employees } = useQuery({
  queryFn: () => api.get('/employees').then(res => res.data)
})
// employees.filter(...) will crash!

// ✅ CORRECT - Extract data property
interface EmployeesResponse {
  data: Employee[]
  pagination: PaginationInfo
}

const { data: response } = useQuery<EmployeesResponse>({
  queryFn: () => api.get('/employees').then(res => res.data)
})
const employees = response?.data || []
// employees.filter(...) works correctly
```

#### **Other Paginated Endpoints:**
- `GET /api/payroll` - Payroll records
- `GET /api/companies` (future: currently returns array directly)
- `GET /api/audit-logs` (future)

### Single Item Endpoints

These endpoints return the item directly (no wrapper):

#### **GET /api/employees/:id**

**Response:**
```typescript
Employee  // Single employee object
```

**Frontend Usage:**
```typescript
const { data: employee } = useQuery({
  queryFn: () => api.get(`/employees/${id}`).then(res => res.data)
})
// employee is the Employee object directly
```

#### **POST /api/employees**

**Response:**
```typescript
Employee  // Newly created employee
```

#### **PUT /api/employees/:id**

**Response:**
```typescript
Employee  // Updated employee
```

#### **Other Single Item Endpoints:**
- `GET /api/companies/:id` - Single company
- `POST /api/companies` - Create company
- `GET /api/payroll/:id` - Single payroll record
- `POST /api/payroll/calculate` - Calculate payroll preview
- `POST /api/payroll/run` - Run payroll batch

### Special Endpoints

#### **GET /api/csrf-token**

**Response:**
```typescript
{
  csrfToken: string
}
```

#### **POST /api/auth/login**

**Response:**
```typescript
{
  token: string,      // JWT access token
  user: {
    id: string,
    email: string,
    role: string,
    // ... other user fields
  }
}
```

## Frontend TypeScript Interfaces

### Pagination Interface

```typescript
interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}
```

### Generic Paginated Response

```typescript
interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationInfo
}

// Usage example
type EmployeesResponse = PaginatedResponse<Employee>
type PayrollsResponse = PaginatedResponse<Payroll>
```

## Best Practices

### 1. Always Define Response Types

```typescript
// ❌ BAD - No type definition
const { data } = useQuery({
  queryFn: () => api.get('/employees').then(res => res.data)
})

// ✅ GOOD - Explicit type
const { data } = useQuery<EmployeesResponse>({
  queryFn: () => api.get('/employees').then(res => res.data)
})
```

### 2. Extract Data from Paginated Responses

```typescript
// ❌ BAD - Direct usage causes crashes
const { data: employees } = useQuery<Employee[]>({...})
employees.map(...)  // Will crash if response has pagination wrapper

// ✅ GOOD - Extract data property
const { data: response } = useQuery<EmployeesResponse>({...})
const employees = response?.data || []
employees.map(...)  // Safe
```

### 3. Handle Loading and Error States

```typescript
const { data: response, isLoading, error } = useQuery<EmployeesResponse>({...})

if (isLoading) return <Loading />
if (error) return <Error message={error.message} />

const employees = response?.data || []
// Safe to use employees here
```

### 4. Use Pagination Information

```typescript
const { data: response } = useQuery<EmployeesResponse>({...})

if (response) {
  console.log(`Page ${response.pagination.page} of ${response.pagination.totalPages}`)
  console.log(`Showing ${response.data.length} of ${response.pagination.total} employees`)
}
```

## Common Mistakes and Fixes

### Mistake 1: Treating Paginated Response as Array

```typescript
// ❌ WRONG
const { data: employees = [] } = useQuery<Employee[]>({
  queryFn: () => api.get('/employees').then(res => res.data)
})
// employees is actually { data: [...], pagination: {...} }
// employees.filter(...) will crash!

// ✅ CORRECT
const { data: response } = useQuery<EmployeesResponse>({
  queryFn: () => api.get('/employees').then(res => res.data)
})
const employees = response?.data || []
```

### Mistake 2: Inconsistent Type Definitions

```typescript
// ❌ BAD - Type doesn't match actual response
interface Employee {...}
const { data } = useQuery<Employee[]>({  // Wrong! Should be EmployeesResponse
  queryFn: () => api.get('/employees').then(res => res.data)
})

// ✅ GOOD - Correct type
interface EmployeesResponse {
  data: Employee[]
  pagination: PaginationInfo
}
const { data } = useQuery<EmployeesResponse>({
  queryFn: () => api.get('/employees').then(res => res.data)
})
```

### Mistake 3: Not Handling Undefined

```typescript
// ❌ RISKY - Might be undefined during loading
const { data: response } = useQuery<EmployeesResponse>({...})
response.data.map(...)  // Crash if undefined!

// ✅ SAFE - Default to empty array
const employees = response?.data || []
employees.map(...)  // Safe even during loading
```

## API Response Examples

### GET /api/employees

**Request:**
```bash
GET /api/employees?page=1&limit=10&companyId=abc123
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "emp-001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "payType": "SALARY",
      "payRate": "75000",
      "isActive": true,
      "company": {
        "name": "Acme Corp"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### GET /api/employees/:id

**Request:**
```bash
GET /api/employees/emp-001
```

**Response (200 OK):**
```json
{
  "id": "emp-001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "ssn": "***-**-1234",
  "payType": "SALARY",
  "payRate": "75000",
  "isActive": true,
  "company": {
    "id": "comp-001",
    "name": "Acme Corp"
  },
  "payrolls": [...]
}
```

### Error Response

**Request:**
```bash
GET /api/employees/invalid-id
```

**Response (404 Not Found):**
```json
{
  "error": "Employee not found"
}
```

## Migration Guide

If you have existing code that assumes direct array responses:

### Step 1: Update TypeScript Interface

```typescript
// Before
const { data: employees = [] } = useQuery<Employee[]>(...)

// After
const { data: response } = useQuery<EmployeesResponse>(...)
const employees = response?.data || []
```

### Step 2: Update Component Logic

```typescript
// Before
{employees.map(emp => ...)}

// After (no change needed if you extracted data)
{employees.map(emp => ...)}
```

### Step 3: Use Pagination Info (Optional)

```typescript
// Add pagination UI if needed
{response?.pagination.totalPages > 1 && (
  <Pagination {...response.pagination} />
)}
```

## Testing API Responses

### Manual Testing

```bash
# Test paginated endpoint
curl http://localhost:5000/api/employees | jq .

# Should return:
# {
#   "data": [...],
#   "pagination": {...}
# }

# Test single item endpoint
curl http://localhost:5000/api/employees/emp-001 | jq .

# Should return:
# { "id": "emp-001", ... }
```

### Unit Testing

```typescript
// Test paginated response handling
test('handles paginated employee response', async () => {
  const mockResponse: EmployeesResponse = {
    data: [mockEmployee1, mockEmployee2],
    pagination: {
      page: 1,
      limit: 50,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    }
  }

  api.get = jest.fn().mockResolvedValue({ data: mockResponse })

  const { result } = renderHook(() => useQuery<EmployeesResponse>({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then(res => res.data)
  }))

  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  expect(result.current.data?.data).toHaveLength(2)
  expect(result.current.data?.pagination.total).toBe(2)
})
```

## Summary

- **Paginated endpoints** return `{ data: T[], pagination: {...} }`
- **Single item endpoints** return the item directly
- Always define proper TypeScript interfaces
- Extract `data` property from paginated responses
- Handle undefined with optional chaining and default values
- Use pagination information for UI enhancements
