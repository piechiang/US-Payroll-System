import crypto from 'crypto';

// 配置常量
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_VERSION = 'v1'; // 密钥版本标识，用于支持未来的密钥轮换
const SEPARATOR = ':';

// 缓存变量，避免重复解析环境变量
let cachedKey: Buffer | null = null;
let cachedSalt: string | null = null;

// Base64 验证正则
const BASE64_REGEX = /^[a-zA-Z0-9+/]*={0,2}$/;

/**
 * 获取加密密钥（带缓存）
 * 在模块加载或首次调用时验证，提高运行时性能
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('FATAL: ENCRYPTION_KEY environment variable is not set');
  }

  // 验证密钥长度 (32 bytes = 256 bits)
  if (keyHex.length !== 64) {
    throw new Error('FATAL: ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256');
  }

  // 验证 Hex 格式
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('FATAL: ENCRYPTION_KEY must contain only valid hexadecimal characters');
  }

  // 存入缓存
  cachedKey = Buffer.from(keyHex, 'hex');
  return cachedKey;
}

/**
 * 获取 SSN 哈希盐值（带缓存）
 */
function getSSNHashSalt(): string {
  if (cachedSalt) return cachedSalt;

  const salt = process.env.SSN_HASH_SALT;
  if (!salt) {
    // 降级策略：如果没有单独设置盐值，使用加密密钥（虽然不推荐，但比崩溃好）
    console.warn('⚠️  WARNING: SSN_HASH_SALT not set, falling back to ENCRYPTION_KEY');
    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey) {
      throw new Error('SSN_HASH_SALT or ENCRYPTION_KEY environment variable must be set');
    }
    cachedSalt = encKey;
  } else {
    cachedSalt = salt;
  }
  return cachedSalt;
}

/**
 * 加密敏感数据
 * 输出格式: v1:iv:authTag:encryptedData (全部 Base64)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // 格式: 版本:IV:AuthTag:密文
    return [
      KEY_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted
    ].join(SEPARATOR);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 解密敏感数据
 * 支持新格式 (v1:...) 和旧格式 (iv:...)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(SEPARATOR)) {
    return ciphertext;
  }

  try {
    const parts = ciphertext.split(SEPARATOR);
    let ivBase64, authTagBase64, encryptedData;

    // 检查是否有版本前缀
    if (parts.length === 4 && parts[0].startsWith('v')) {
      // 新格式: v1:iv:tag:data
      [, ivBase64, authTagBase64, encryptedData] = parts;
      // 未来可以在这里根据 parts[0] 选择不同的密钥进行解密
    } else if (parts.length === 3) {
      // 旧格式: iv:tag:data (兼容性支持)
      [ivBase64, authTagBase64, encryptedData] = parts;
    } else {
      // 格式无效，直接返回原文或抛出错误
      console.warn('Invalid ciphertext format, returning original string');
      return ciphertext;
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // 解密失败通常意味着密钥错误或数据被篡改
    console.error('Decryption failed:', error);
    // 为了安全，不返回具体的错误原因，通常返回空字符串或抛出通用错误
    throw new Error('Failed to decrypt data');
  }
}

/**
 * 检查字符串是否已加密
 * 严格验证格式以避免误判
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  const parts = value.split(SEPARATOR);

  // 检查新格式 (v1:iv:tag:data)
  if (parts.length === 4 && parts[0].startsWith('v')) {
    return (
      BASE64_REGEX.test(parts[1]) &&
      BASE64_REGEX.test(parts[2]) &&
      BASE64_REGEX.test(parts[3])
    );
  }

  // 检查旧格式 (iv:tag:data)
  if (parts.length === 3) {
    return (
      BASE64_REGEX.test(parts[0]) &&
      BASE64_REGEX.test(parts[1]) &&
      BASE64_REGEX.test(parts[2])
    );
  }

  return false;
}

/**
 * 如果尚未加密，则进行加密
 */
export function encryptIfNeeded(value: string): string {
  if (!value) return value;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

/**
 * SSN 掩码处理 (只显示最后4位)
 * 输入可以是明文或密文
 */
export function maskSSN(ssn: string): string {
  if (!ssn) return '';

  try {
    // 如果是密文，先解密
    const plainSSN = isEncrypted(ssn) ? decrypt(ssn) : ssn;

    // 再次清理非数字字符，确保掩码正确
    const cleanSSN = plainSSN.replace(/[^0-9]/g, '');

    if (cleanSSN.length >= 4) {
      return `XXX-XX-${cleanSSN.slice(-4)}`;
    }
    return 'XXX-XX-XXXX';
  } catch (error) {
    return 'XXX-XX-ERROR';
  }
}

/**
 * 银行账号掩码处理
 */
export function maskBankAccount(accountNumber: string): string {
  if (!accountNumber) return '';

  try {
    const plainAccount = isEncrypted(accountNumber) ? decrypt(accountNumber) : accountNumber;

    if (plainAccount.length >= 4) {
      return `****${plainAccount.slice(-4)}`;
    }
    return '****';
  } catch (error) {
    return '****ERROR';
  }
}

/**
 * 生成 SSN 确定性哈希
 * 用于查找重复 SSN 而不解密
 */
export function hashSSN(ssn: string): string {
  if (!ssn) return '';

  // 标准化: 移除所有非字母数字字符
  const normalizedSSN = ssn.replace(/[^a-zA-Z0-9]/g, '');

  const salt = getSSNHashSalt();
  const hmac = crypto.createHmac('sha256', salt);
  hmac.update(normalizedSSN);

  return hmac.digest('hex');
}

/**
 * 验证 SSN 哈希
 * 使用定时安全比较防止时序攻击
 */
export function verifySSNHash(plainSSN: string, storedHash: string): boolean {
  if (!plainSSN || !storedHash) return false;

  const computedHash = hashSSN(plainSSN);

  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) return false;

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}
