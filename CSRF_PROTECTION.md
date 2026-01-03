# CSRF Protection Implementation

## Overview

This application implements **Double Submit Cookie** CSRF protection to prevent Cross-Site Request Forgery attacks on all state-changing operations.

## How It Works

### Server-Side (Backend)

**Middleware**: `server/src/middleware/csrf.ts`

1. **CSRF Token Generation Endpoint**
   - `GET /api/csrf-token` - Returns a CSRF token
   - `GET /api/v1/csrf-token` - Versioned endpoint
   - The token is automatically stored in a secure HTTP-only cookie: `__Host-psifi.x-csrf-token`

2. **CSRF Validation**
   - Applied to all state-changing routes: POST, PUT, DELETE, PATCH
   - Validates that the `X-CSRF-Token` header matches the cookie value
   - Returns 403 error if validation fails

3. **Protected Routes**
   - `/api/employees/*` (POST, PUT, DELETE)
   - `/api/companies/*` (POST, PUT, DELETE)
   - `/api/payroll/*` (POST, PUT, DELETE)
   - `/api/w2/*` (POST, PUT, DELETE)
   - `/api/payroll-approval/*` (POST, PUT, DELETE)
   - `/api/ach/*` (POST, PUT, DELETE)

4. **Unprotected Routes** (Read-only operations)
   - `/api/tax-info/*` (GET only)
   - `/api/gl-export/*` (GET only - export operations)

### Client-Side (Frontend)

**API Service**: `client/src/services/api.ts`

1. **Automatic Token Management**
   - CSRF token is fetched on app initialization (if user is logged in)
   - CSRF token is fetched after successful login
   - Token is stored in memory (not localStorage for security)

2. **Request Interceptor**
   - Automatically attaches `X-CSRF-Token` header to POST/PUT/DELETE/PATCH requests
   - Fetches token automatically if not available
   - Supports `withCredentials: true` to send cookies

3. **Response Interceptor**
   - Detects 403 CSRF validation errors
   - Automatically retries request with fresh token (one retry)
   - Clears token on logout (401)

## Configuration

### Environment Variables

**Server** (`.env` or environment):

```bash
# CSRF Secret (REQUIRED in production)
CSRF_SECRET=your-random-32-character-secret-here

# Disable CSRF (development only)
DISABLE_CSRF=false  # Set to 'true' to disable (NOT recommended)
```

**Client** (`.env` or environment):

No client-side configuration needed. CSRF handling is automatic.

## Security Features

1. **HTTP-Only Cookie**: The CSRF token cookie is HTTP-only, preventing JavaScript access
2. **SameSite=Strict**: Cookie is only sent on same-site requests
3. **Secure Flag**: Cookie is HTTPS-only in production
4. **__Host- Prefix**: Ensures cookie is only set on the current domain with Secure flag
5. **64-byte Token**: Strong random token generation
6. **IP-based Session**: Token is tied to user's IP address

## Usage Examples

### Frontend (Automatic)

```typescript
// No manual CSRF handling needed!
// The axios interceptor handles everything automatically

// Example: Create employee (POST request)
await api.post('/employees', {
  firstName: 'John',
  lastName: 'Doe',
  // ... other fields
})
// X-CSRF-Token header is automatically added

// Example: Update employee (PUT request)
await api.put(`/employees/${id}`, updatedData)
// X-CSRF-Token header is automatically added

// Example: Delete employee (DELETE request)
await api.delete(`/employees/${id}`)
// X-CSRF-Token header is automatically added
```

### Manual Token Fetching (Advanced)

```typescript
import { fetchCsrfToken, getCsrfToken } from './services/api'

// Fetch fresh token
await fetchCsrfToken()

// Get current token
const token = getCsrfToken()
```

## Error Handling

### 403 CSRF Validation Failed

**Error Response**:
```json
{
  "error": "CSRF validation failed",
  "message": "Invalid or missing CSRF token. Please refresh and try again."
}
```

**Automatic Retry**:
The client automatically:
1. Detects the CSRF error
2. Fetches a fresh token
3. Retries the original request once
4. If still fails, returns error to user

**Manual Handling** (if needed):
```typescript
try {
  await api.post('/employees', data)
} catch (error) {
  if (error.response?.status === 403 &&
      error.response?.data?.error === 'CSRF validation failed') {
    // Automatic retry already attempted
    alert('Security validation failed. Please refresh the page and try again.')
  }
}
```

## Testing CSRF Protection

### Development Mode

**Disable CSRF for testing**:
```bash
# In .env or environment
DISABLE_CSRF=true
```

**Enable CSRF for testing**:
```bash
# In .env or environment
DISABLE_CSRF=false
CSRF_SECRET=test-csrf-secret-32-characters-min
```

### Production Mode

CSRF is **always enabled** in production. The application will throw an error if `CSRF_SECRET` is not set.

### Manual Testing

1. **Test with valid token**:
```bash
# Get token
curl http://localhost:5000/api/csrf-token \
  -c cookies.txt

# Extract token from response
TOKEN="<csrfToken from response>"

# Make authenticated request
curl http://localhost:5000/api/employees \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-CSRF-Token: $TOKEN" \
  -b cookies.txt \
  -d '{"firstName":"John","lastName":"Doe",...}'
```

2. **Test without token (should fail)**:
```bash
curl http://localhost:5000/api/employees \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"firstName":"John","lastName":"Doe",...}'

# Response: 403 Forbidden
# {"error":"CSRF validation failed","message":"Invalid or missing CSRF token..."}
```

3. **Test with invalid token (should fail)**:
```bash
curl http://localhost:5000/api/employees \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-CSRF-Token: invalid-token" \
  -b cookies.txt \
  -d '{"firstName":"John","lastName":"Doe",...}'

# Response: 403 Forbidden
```

## Production Deployment

### 1. Set CSRF Secret

```bash
# Generate a secure random secret (32+ characters)
openssl rand -base64 32

# Set in environment
export CSRF_SECRET="your-generated-secret-here"
```

### 2. Ensure HTTPS

CSRF cookies require HTTPS in production. The `secure` flag is automatically set.

### 3. Verify Configuration

```bash
# Check CSRF is enabled
curl https://your-domain.com/api/csrf-token

# Should return: {"csrfToken":"..."}
```

### 4. Monitor Logs

Watch for CSRF-related warnings:
- `⚠️ WARNING: Using default CSRF secret` - Bad! Set CSRF_SECRET
- `⚠️ CSRF protection is DISABLED` - Bad! Remove DISABLE_CSRF=true

## Common Issues

### Issue 1: "CSRF validation failed" on all requests

**Cause**: Missing or mismatched CSRF token

**Solutions**:
1. Check browser cookies - should have `__Host-psifi.x-csrf-token`
2. Check request headers - should have `X-CSRF-Token`
3. Ensure `withCredentials: true` is set in axios config
4. Check browser console for CSRF token fetch errors
5. Verify CORS allows credentials

### Issue 2: Token not being sent

**Cause**: `withCredentials` not set, or CORS blocking cookies

**Solutions**:
1. Verify `client/src/services/api.ts` has `withCredentials: true`
2. Check server CORS config allows credentials:
   ```typescript
   cors({
     origin: 'http://localhost:3000',
     credentials: true  // MUST be true
   })
   ```

### Issue 3: "CSRF_SECRET must be set in production"

**Cause**: Environment variable not configured

**Solution**:
```bash
export CSRF_SECRET="$(openssl rand -base64 32)"
```

## Security Considerations

1. **Never log CSRF tokens** - They are sensitive security tokens
2. **Never store tokens in localStorage** - Use memory or HTTP-only cookies only
3. **Always use HTTPS in production** - Required for secure cookies
4. **Rotate CSRF_SECRET periodically** - Update every 90 days
5. **Don't disable CSRF in production** - Keep `DISABLE_CSRF=false` always

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
- [csrf-csrf npm package](https://www.npmjs.com/package/csrf-csrf)
