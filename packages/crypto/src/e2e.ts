/**
 * E2E encryption using X25519 key exchange + AES-256-GCM.
 * Private keys never leave the device (SecureStore / localStorage).
 * Server only stores public keys and encrypted ciphertext.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export type IdentityKeyPair = {
  publicKey: string;
  privateKey: string;
};

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  version: number;
};

const E2E_VERSION = 1;
const INFO_DIRECT = utf8ToBytes("thetextapp-e2e-direct-v1");
const INFO_GROUP = utf8ToBytes("thetextapp-e2e-group-v1");

function parseHexKey(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== "string") {
    throw new TypeError(`${label}: expected hex string, got ${typeof value}`);
  }
  const hex = value.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new TypeError(`${label}: invalid hex key`);
  }
  return hexToBytes(hex);
}

export function getPublicKeyFromPrivate(privateKeyHex: string): string {
  const publicKey = x25519.getPublicKey(parseHexKey(privateKeyHex, "privateKey"));
  return bytesToHex(publicKey);
}

export function generateIdentityKeyPair(): IdentityKeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

export function deriveDirectKey(
  myPrivateKeyHex: string,
  theirPublicKeyHex: string,
  conversationId: string
): Uint8Array {
  const shared = x25519.getSharedSecret(
    parseHexKey(myPrivateKeyHex, "myPrivateKey"),
    parseHexKey(theirPublicKeyHex, "theirPublicKey")
  );
  return hkdf(sha256, shared, sha256(utf8ToBytes(conversationId)), INFO_DIRECT, 32);
}

export function deriveGroupKey(
  groupKeyHex: string,
  conversationId: string
): Uint8Array {
  return hkdf(sha256, parseHexKey(groupKeyHex, "groupKey"), sha256(utf8ToBytes(conversationId)), INFO_GROUP, 32);
}

export function generateGroupKey(): string {
  return bytesToHex(randomBytes(32));
}

/** Encrypt a group key for a member using ECDH with their identity public key. */
export function wrapGroupKeyForMember(
  groupKeyHex: string,
  senderPrivateKeyHex: string,
  memberPublicKeyHex: string,
  conversationId: string
): EncryptedPayload {
  const wrappingKey = deriveDirectKey(senderPrivateKeyHex, memberPublicKeyHex, conversationId);
  return encryptWithKey(groupKeyHex, wrappingKey);
}

/** Decrypt a wrapped group key using own private key and sender's public key. */
export function unwrapGroupKeyForMember(
  wrapped: EncryptedPayload,
  myPrivateKeyHex: string,
  senderPublicKeyHex: string,
  conversationId: string
): string {
  const wrappingKey = deriveDirectKey(myPrivateKeyHex, senderPublicKeyHex, conversationId);
  return decryptWithKey(wrapped, wrappingKey);
}

export function encryptMessage(plaintext: string, key: Uint8Array): EncryptedPayload {
  return encryptWithKey(plaintext, key);
}

export function decryptMessage(payload: EncryptedPayload, key: Uint8Array): string {
  return decryptWithKey(payload, key);
}

function encryptWithKey(plaintext: string, key: Uint8Array): EncryptedPayload {
  const nonce = randomBytes(12);
  const aes = gcm(key, nonce);
  const encrypted = aes.encrypt(new TextEncoder().encode(plaintext));
  return {
    ciphertext: bytesToHex(encrypted),
    nonce: bytesToHex(nonce),
    version: E2E_VERSION,
  };
}

function decryptWithKey(payload: EncryptedPayload, key: Uint8Array): string {
  const aes = gcm(key, hexToBytes(payload.nonce));
  const decrypted = aes.decrypt(hexToBytes(payload.ciphertext));
  return new TextDecoder().decode(decrypted);
}

export function serializePayload(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

export function parsePayload(serialized: string): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(serialized) as EncryptedPayload;
    if (parsed.ciphertext && parsed.nonce && parsed.version) return parsed;
    return null;
  } catch {
    return null;
  }
}
