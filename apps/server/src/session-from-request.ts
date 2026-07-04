import { createHMAC } from "@better-auth/utils/hmac";
import { getCookies, setRequestCookie } from "better-auth/cookies";
import { serializeSignedCookie } from "better-call";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@thetextapp/db";
import * as schema from "@thetextapp/db/schema";
import { auth } from "./auth.js";

const SESSION_COOKIE = getCookies(auth.options).sessionToken.name;
const SECRET = auth.options.secret;

function tryDecode(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/** Raw session token from bearer (unsigned or signed cookie value). */
function rawTokenFromBearer(bearer: string): string {
  if (!bearer.includes(".")) return bearer;
  const decoded = bearer.includes("%") ? tryDecode(bearer) : bearer;
  return decoded.split(".")[0] ?? bearer;
}

/** Match better-auth bearer plugin: convert bearer → signed session cookie value. */
async function bearerToSessionCookieValue(bearer: string): Promise<string | null> {
  if (!SECRET) return null;

  let decodedToken: string;
  if (bearer.includes(".")) {
    decodedToken = bearer.includes("%") ? tryDecode(bearer) : bearer;
  } else {
    decodedToken = tryDecode(
      (await serializeSignedCookie("", bearer, SECRET)).replace("=", "")
    );
  }

  try {
    const [payload, signature] = decodedToken.split(".");
    if (!payload || !signature) return null;
    const valid = await createHMAC("SHA-256", "base64urlnopad").verify(
      SECRET,
      payload,
      signature
    );
    return valid ? decodedToken : null;
  } catch {
    return null;
  }
}

async function getSessionByTokenFromDb(token: string) {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      session: schema.session,
      user: schema.user,
    })
    .from(schema.session)
    .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
    .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, now)))
    .limit(1);

  if (!row) return null;

  return {
    session: row.session,
    user: row.user,
  };
}

/** Resolve Better Auth session from cookies and/or Authorization bearer (cross-origin web). */
export async function getSessionFromRequest(request: Request) {
  const headers = new Headers(request.headers);
  const authorization = headers.get("authorization");
  let bearerRaw: string | null = null;

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    bearerRaw = authorization.slice(7).trim() || null;
    if (bearerRaw) {
      const cookieValue = await bearerToSessionCookieValue(bearerRaw);
      if (cookieValue) {
        setRequestCookie(headers, SESSION_COOKIE, cookieValue);
      }
    }
  }

  const fromCookie = await auth.api.getSession({ headers });
  if (fromCookie) return fromCookie;

  if (bearerRaw) {
    return getSessionByTokenFromDb(rawTokenFromBearer(bearerRaw));
  }

  return null;
}
