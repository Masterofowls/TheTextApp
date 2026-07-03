import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";
import { getRandomBytes } from "expo-crypto";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*-_+=";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

const CLIPBOARD_CLEAR_MS = 60_000;

let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

function pickChar(pool: string, byte: number): string {
  return pool[byte % pool.length]!;
}

function shuffleChars(chars: string[], random: Uint8Array): string {
  const arr = [...chars];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = random[i]! % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.join("");
}

/** Cryptographically secure password (default 16 chars, all character classes). */
export function generateSecurePassword(length = 16): string {
  const size = Math.max(12, Math.min(32, length));
  const random = getRandomBytes(size);

  const required = [
    pickChar(LOWER, random[0]!),
    pickChar(UPPER, random[1]!),
    pickChar(DIGITS, random[2]!),
    pickChar(SYMBOLS, random[3]!),
  ];

  const rest = Array.from({ length: size - 4 }, (_, i) =>
    pickChar(ALL, random[i + 4]!)
  );

  return shuffleChars([...required, ...rest], getRandomBytes(size));
}

export type PasswordHints = {
  minLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
  isStrong: boolean;
  label: "weak" | "fair" | "good" | "strong";
};

export function getPasswordHints(password: string): PasswordHints {
  const minLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const score = [minLength, hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean)
    .length;

  const label =
    score <= 2 ? "weak" : score === 3 ? "fair" : score === 4 ? "good" : "strong";

  return {
    minLength,
    hasLower,
    hasUpper,
    hasDigit,
    hasSymbol,
    isStrong: minLength && score >= 4,
    label,
  };
}

/** Copy password to clipboard; marked sensitive on Android, auto-clears after 60s. */
export async function copyPasswordSecurely(password: string): Promise<void> {
  if (clipboardClearTimer) {
    clearTimeout(clipboardClearTimer);
    clipboardClearTimer = null;
  }

  const options =
    Platform.OS === "android"
      ? ({ android: { isSensitive: true } } as Parameters<typeof Clipboard.setStringAsync>[1])
      : undefined;

  await Clipboard.setStringAsync(password, options);

  clipboardClearTimer = setTimeout(() => {
    Clipboard.setStringAsync("").catch(() => {});
    clipboardClearTimer = null;
  }, CLIPBOARD_CLEAR_MS);
}

export function getClipboardClearSeconds(): number {
  return CLIPBOARD_CLEAR_MS / 1000;
}
