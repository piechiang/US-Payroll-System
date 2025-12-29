import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get SSN hash salt from environment (separate from encryption key for defense in depth)
function getSSNHashSalt(): string {
  const salt = process.env.SSN_HASH_SALT;
  if (!salt) {
    // Fall back to encryption key if SSN_HASH_SALT not set
    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey) {
      throw new Error('SSN_HASH_SALT or ENCRYPTION_KEY environment variable must be set');
    }
    return encKey;
  }
  return salt;
}

// Validate hex string format
function isValidHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Key should be 64 hex characters (32 bytes)
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  // Validate hex format
  if (!isValidHex(key)) {
    throw new Error('ENCRYPTION_KEY must contain only valid hexadecimal characters (0-9, a-f, A-F)');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive data (SSN, bank account numbers)
 * Returns a string in format: iv:authTag:encryptedData (all base64)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and encrypted data
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 * Input format: iv:authTag:encryptedData (all base64)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(':')) {
    return ciphertext;
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const [ivBase64, authTagBase64, encryptedData] = parts;

  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask SSN for display (show only last 4 digits)
 * Input: either encrypted or plain SSN
 */
export function maskSSN(ssn: string): string {
  if (!ssn) return '';

  // If encrypted, decrypt first
  const plainSSN = ssn.includes(':') ? decrypt(ssn) : ssn;

  // Return masked version: XXX-XX-1234
  if (plainSSN.length >= 4) {
    return `XXX-XX-${plainSSN.slice(-4)}`;
  }

  return 'XXX-XX-XXXX';
}

/**
 * Mask bank account number for display
 * Shows only last 4 digits
 */
export function maskBankAccount(accountNumber: string): string {
  if (!accountNumber) return '';

  // If encrypted, decrypt first
  const plainAccount = accountNumber.includes(':') ? decrypt(accountNumber) : accountNumber;

  if (plainAccount.length >= 4) {
    return `****${plainAccount.slice(-4)}`;
  }

  return '****';
}

/**
 * Check if a value is already encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check if parts look like base64
  try {
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt if not already encrypted
 */
export function encryptIfNeeded(value: string): string {
  if (!value) return value;

  if (isEncrypted(value)) {
    return value;
  }

  return encrypt(value);
}

/**
 * Generate a deterministic hash of SSN for uniqueness checking
 * Uses HMAC-SHA256 with a secret salt for security
 *
 * This allows for efficient duplicate detection without exposing the SSN:
 * - Same SSN always produces same hash (deterministic)
 * - Cannot reverse hash to get SSN (one-way)
 * - Salt prevents rainbow table attacks
 *
 * @param ssn Plain text SSN (XXX-XX-XXXX format)
 * @returns Hex-encoded hash string
 */
export function hashSSN(ssn: string): string {
  if (!ssn) return '';

  // Normalize SSN: remove dashes and spaces
  const normalizedSSN = ssn.replace(/[-\s]/g, '');

  const salt = getSSNHashSalt();
  const hmac = crypto.createHmac('sha256', salt);
  hmac.update(normalizedSSN);

  return hmac.digest('hex');
}

/**
 * Compare a plain SSN against a stored hash
 */
export function verifySSNHash(plainSSN: string, storedHash: string): boolean {
  if (!plainSSN || !storedHash) return false;

  const computedHash = hashSSN(plainSSN);
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}
