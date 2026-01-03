# PDF Download Authentication Fix

## Problem

PDF downloads were failing in production because `window.open()` doesn't send the JWT Bearer token stored in `localStorage`, causing authentication to fail on protected PDF endpoints.

### Technical Details

**Before Fix:**
```typescript
// PayrollHistory.tsx - BROKEN
const handlePrintPDF = (payrollId: string) => {
  window.open(`/api/payroll/${payrollId}/pdf`, '_blank')
  // ❌ No Authorization header sent
  // ❌ Returns 401 Unauthorized in production
}
```

**Why it Failed:**
1. JWT token is stored in `localStorage`
2. `window.open()` creates a new browser context
3. Browser doesn't automatically include `localStorage` data in HTTP headers
4. Server requires `Authorization: Bearer <token>` header
5. Request fails with 401 Unauthorized

### Impact

- ❌ Users couldn't view or download paystubs
- ❌ Users couldn't print payroll PDFs
- ❌ All PDF export functionality broken in production
- ✅ Worked in development (if `REQUIRE_AUTH=false`)

## Solution

Use axios with `responseType: 'blob'` to download PDFs with proper authentication headers, then create temporary object URLs for viewing/downloading.

### Implementation Pattern

```typescript
const handlePrintPDF = async (payrollId: string) => {
  try {
    // 1. Download PDF via axios (includes Authorization header automatically)
    const response = await api.get(`/payroll/${payrollId}/pdf`, {
      responseType: 'blob', // Critical: tells axios to handle binary data
    })

    // 2. Create Blob from binary response data
    const blob = new Blob([response.data], { type: 'application/pdf' })

    // 3. Create temporary object URL
    const url = window.URL.createObjectURL(blob)

    // 4. Open PDF in new tab
    window.open(url, '_blank')

    // 5. Clean up temporary URL
    setTimeout(() => window.URL.revokeObjectURL(url), 100)
  } catch (error) {
    console.error('Failed to download PDF:', error)
    alert('Failed to generate PDF. Please try again.')
  }
}
```

### Key Components

1. **axios with responseType: 'blob'**
   - Automatically includes `Authorization` header from interceptor
   - Handles binary PDF data correctly
   - Supports all axios features (interceptors, error handling)

2. **Blob API**
   - Creates blob from binary data
   - Specifies correct MIME type (`application/pdf`)

3. **Object URL**
   - `createObjectURL()` creates temporary browser URL
   - URL points to in-memory blob data
   - Can be used with `window.open()` or download links

4. **Cleanup**
   - `revokeObjectURL()` releases memory
   - Called after short delay to ensure PDF loads
   - Prevents memory leaks

## Files Modified

### 1. client/src/pages/PayrollHistory.tsx

**Before:**
```typescript
const handlePrintPDF = (payrollId: string) => {
  window.open(`/api/payroll/${payrollId}/pdf`, '_blank')
}
```

**After:**
```typescript
const handlePrintPDF = async (payrollId: string) => {
  try {
    const response = await api.get(`/payroll/${payrollId}/pdf`, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    window.open(url, '_blank')

    setTimeout(() => window.URL.revokeObjectURL(url), 100)
  } catch (error) {
    console.error('Failed to download PDF:', error)
    alert('Failed to generate PDF. Please try again.')
  }
}
```

**Impact:**
- ✅ Print button now works with authentication
- ✅ Error handling for failed downloads
- ✅ User-friendly error messages

### 2. client/src/pages/PaystubView.tsx

**Before:**
```typescript
const handlePrint = () => {
  window.open(`/api/payroll/${id}/pdf`, '_blank')
}

const handleDownload = () => {
  const link = document.createElement('a')
  link.href = `/api/payroll/${id}/pdf`  // ❌ No auth
  link.download = `paystub-${payroll?.employee.lastName}-${payroll?.payDate}.pdf`
  link.click()
}
```

**After:**
```typescript
const handlePrint = async () => {
  try {
    const response = await api.get(`/payroll/${id}/pdf`, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    window.open(url, '_blank')

    setTimeout(() => window.URL.revokeObjectURL(url), 100)
  } catch (error) {
    console.error('Failed to print PDF:', error)
    alert('Failed to generate PDF. Please try again.')
  }
}

const handleDownload = async () => {
  try {
    const response = await api.get(`/payroll/${id}/pdf`, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `paystub-${payroll?.employee.lastName}-${payroll?.payDate.split('T')[0]}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to download PDF:', error)
    alert('Failed to download PDF. Please try again.')
  }
}
```

**Impact:**
- ✅ Print button works with authentication
- ✅ Download button works with authentication
- ✅ Proper filename for downloaded PDFs
- ✅ Error handling for both operations

## How It Works

### Authentication Flow

1. **User clicks PDF button**
   ```
   User → PayrollHistory.tsx → handlePrintPDF()
   ```

2. **Axios makes authenticated request**
   ```typescript
   api.get('/payroll/123/pdf', { responseType: 'blob' })
   ↓
   Request Interceptor adds: Authorization: Bearer eyJhbGc...
   ↓
   Server: GET /api/payroll/123/pdf
   ```

3. **Server validates authentication**
   ```typescript
   // server/src/routes/payroll.ts
   router.get('/:id/pdf', exportLimiter, async (req: AuthRequest, res: Response) => {
     // authenticate middleware already verified JWT
     // hasCompanyAccess() verifies user can access this payroll
     if (!hasCompanyAccess(req, payroll.companyId)) {
       return res.status(403).json({ error: 'Access denied' });
     }
     // Generate and return PDF
   });
   ```

4. **Client receives PDF binary data**
   ```
   Response: application/pdf (binary data)
   ↓
   axios converts to Blob
   ↓
   createObjectURL() creates temporary URL
   ↓
   window.open(url) opens PDF in new tab
   ```

### Download Flow (PaystubView)

Same as print flow, but instead of `window.open()`:

1. Create hidden `<a>` element
2. Set `href` to object URL
3. Set `download` attribute to filename
4. Programmatically click the link
5. Remove link from DOM
6. Revoke object URL

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Blob API | ✅ All | ✅ All | ✅ All | ✅ All |
| createObjectURL | ✅ All | ✅ All | ✅ All | ✅ All |
| revokeObjectURL | ✅ All | ✅ All | ✅ All | ✅ All |
| axios blob response | ✅ All | ✅ All | ✅ All | ✅ All |

**Result**: Works in all modern browsers

## Security Considerations

### ✅ Advantages of This Approach

1. **Proper Authentication**
   - JWT token sent in every request
   - Server validates user access to each PDF
   - Multi-tenant access control enforced

2. **No Token Exposure**
   - Token never exposed in URL
   - Token never visible in browser history
   - Token transmitted in secure HTTP header

3. **Server-Side Authorization**
   - Every PDF request goes through `authenticate` middleware
   - `hasCompanyAccess()` verifies company permissions
   - Rate limiting applied (10 exports per hour)

4. **Audit Trail**
   - All PDF access logged via authentication middleware
   - User ID, IP, and timestamp recorded
   - Suspicious patterns can be detected

### ⚠️ Security Notes

1. **Object URLs are Temporary**
   - URLs like `blob:http://localhost:3000/abc-123` are temporary
   - Only work in the browser that created them
   - Automatically invalidated when revokeObjectURL() is called

2. **No URL Sharing**
   - Object URLs can't be shared between users
   - Each user must authenticate to get their own PDF
   - URLs expire when page is closed

3. **Memory Management**
   - Always call `revokeObjectURL()` to prevent memory leaks
   - Use timeout to ensure PDF loads before cleanup
   - 100ms delay is sufficient for most cases

## Error Handling

### Authentication Errors (401)

```typescript
// Handled automatically by axios response interceptor
if (error.response?.status === 401) {
  localStorage.removeItem('token')
  window.location.href = '/login'
}
```

User is redirected to login page if token is expired or invalid.

### Authorization Errors (403)

```typescript
catch (error) {
  console.error('Failed to download PDF:', error)
  alert('Failed to generate PDF. Please try again.')
}
```

User sees friendly error message. Console logs full error for debugging.

### Network Errors

- Axios handles network failures gracefully
- User sees error message
- Can retry by clicking button again

## Testing

### Manual Testing

1. **Test authenticated PDF view**
   ```
   1. Log in as user
   2. Navigate to Payroll History
   3. Click "Print" icon on any payroll record
   4. ✅ PDF should open in new tab
   ```

2. **Test authenticated PDF download**
   ```
   1. Navigate to individual paystub view
   2. Click "Download" button
   3. ✅ PDF should download with correct filename
   ```

3. **Test without authentication**
   ```
   1. Clear localStorage: localStorage.clear()
   2. Try to open PDF
   3. ✅ Should redirect to login page (401)
   ```

4. **Test wrong company access**
   ```
   1. Log in as User A (company 1)
   2. Try to access PDF from company 2
   3. ✅ Should show "Failed to generate PDF" (403)
   ```

### Browser Testing

Test in multiple browsers to ensure blob download works:
- Chrome/Edge (Chromium)
- Firefox
- Safari (macOS/iOS)

## Performance Considerations

### Blob Size

- Typical paystub PDF: 50-200 KB
- Object URL creation: < 1ms
- Memory usage: temporary (freed on revoke)

### Network

- Same as before (still downloads PDF data)
- Slightly slower than direct link (two-step process)
- User experience: nearly identical

### Memory Cleanup

```typescript
// Good: Clean up after delay
setTimeout(() => window.URL.revokeObjectURL(url), 100)

// Bad: Immediate cleanup (PDF might not load)
window.URL.revokeObjectURL(url)

// Bad: Never cleanup (memory leak)
// Missing revokeObjectURL() call
```

## Future Enhancements

### 1. Loading States

```typescript
const [isDownloading, setIsDownloading] = useState(false)

const handlePrintPDF = async (payrollId: string) => {
  setIsDownloading(true)
  try {
    // ... download logic
  } finally {
    setIsDownloading(false)
  }
}
```

### 2. Progress Tracking

```typescript
const response = await api.get('/payroll/id/pdf', {
  responseType: 'blob',
  onDownloadProgress: (progressEvent) => {
    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
    setProgress(percentCompleted)
  }
})
```

### 3. Retry Logic

```typescript
const downloadWithRetry = async (url, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await api.get(url, { responseType: 'blob' })
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

## Related Files

### Client
- `client/src/pages/PayrollHistory.tsx` - Print PDF button
- `client/src/pages/PaystubView.tsx` - Print & Download PDF buttons
- `client/src/services/api.ts` - axios configuration with auth interceptor

### Server
- `server/src/routes/payroll.ts` - PDF generation endpoint
- `server/src/middleware/auth.ts` - Authentication middleware
- `server/src/utils/pdfGenerator.ts` - PDF generation logic

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Authentication | ❌ No Bearer token | ✅ Bearer token in header |
| Production | ❌ 401 Unauthorized | ✅ Works correctly |
| Error Handling | ❌ Silent failure | ✅ User-friendly messages |
| Security | ⚠️ Would need URL tokens | ✅ Proper JWT auth |
| Memory | ✅ No leaks | ✅ Proper cleanup |
| Browser Support | ✅ All | ✅ All |

**Result**: PDF download now works correctly in production with full authentication and authorization.
