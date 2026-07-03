/** Internal domain — users never see this; satisfies Better Auth email sign-up API. */
const INTERNAL_EMAIL_DOMAIN = "users.thetextapp.internal";

export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

export function isValidUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && USERNAME_PATTERN.test(value);
}

export function usernameToInternalEmail(username: string): string {
  return `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email?.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}

export function formatUserHandle(user: {
  username?: string | null;
  displayUsername?: string | null;
  email?: string | null;
}): string | null {
  const handle = user.displayUsername ?? user.username;
  if (handle) return `@${handle}`;
  if (isInternalEmail(user.email)) return null;
  return user.email ?? null;
}
