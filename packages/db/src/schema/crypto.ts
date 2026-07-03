import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { conversations } from "./chat";

/** Public identity keys for E2E encryption (private keys stay on device). */
export const userIdentityKeys = pgTable(
  "user_identity_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    keyVersion: text("key_version").notNull().default("1"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at"),
  },
  (t) => [
    uniqueIndex("user_identity_keys_user_version").on(t.userId, t.keyVersion),
    index("user_identity_keys_user_idx").on(t.userId),
  ]
);

/** Wrapped group keys per member (encrypted with member's identity key). */
export const conversationKeyBundles = pgTable(
  "conversation_key_bundles",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wrappedKey: text("wrapped_key").notNull(),
    wrappedByUserId: text("wrapped_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_key_bundles_unique").on(t.conversationId, t.userId),
    index("conversation_key_bundles_conv_idx").on(t.conversationId),
  ]
);
