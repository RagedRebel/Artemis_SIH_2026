import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const KEY_LEN = 32

function getKey(): Buffer {
  const raw = process.env.ATHENIX_MASTER_KEY
  if (!raw) {
    throw new Error('ATHENIX_MASTER_KEY environment variable is not set')
  }
  const key = Buffer.from(raw, 'hex')
  if (key.length !== KEY_LEN) {
    throw new Error(`ATHENIX_MASTER_KEY must be ${KEY_LEN} bytes (${KEY_LEN * 2} hex chars), got ${key.length}`)
  }
  return key
}

export interface EncryptedSecret {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = getKey()
  const decipher = createDecipheriv(ALGO, key, secret.iv)
  decipher.setAuthTag(secret.authTag)
  const plaintext = Buffer.concat([decipher.update(secret.ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
