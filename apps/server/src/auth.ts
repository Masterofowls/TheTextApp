import "./env.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { bearer } from "better-auth/plugins/bearer";
import { username } from "better-auth/plugins/username";
import { getDb } from "@thetextapp/db";
import * as schema from "@thetextapp/db/schema";

const db = getDb();

export const auth = betterAuth({
  appName: "TheTextApp",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:9001",
  secret: process.env.BETTER_AUTH_SECRET!,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    autoSignIn: true,
  },
  trustedOrigins: [
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:19006",
    "http://localhost:9001",
    "thetextapp://",
    "exp://",
    ...(process.env.TRUSTED_ORIGINS?.split(",").filter(Boolean) ?? []),
  ],
  plugins: [
    expo(),
    passkey({
      rpID: process.env.PASSKEY_RP_ID ?? "localhost",
      rpName: "TheTextApp",
      origin: [
        process.env.PASSKEY_ORIGIN ?? "http://localhost:8081",
        "http://localhost:8082",
        ...(process.env.PASSKEY_ORIGINS?.split(",").filter(Boolean) ?? []),
      ],
    }),
    bearer(),
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
  ],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
});

export type Session = typeof auth.$Infer.Session;
