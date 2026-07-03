import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "group",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "file",
  "system",
  "call",
]);

export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "active",
  "ended",
  "missed",
  "declined",
]);

export const callTypeEnum = pgEnum("call_type", ["audio", "video"]);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    type: conversationTypeEnum("type").notNull().default("direct"),
    title: text("title"),
    avatarUrl: text("avatar_url"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("conversations_updated_at_idx").on(t.updatedAt)]
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at"),
    muted: boolean("muted").notNull().default(false),
  },
  (t) => [
    uniqueIndex("conversation_members_unique").on(t.conversationId, t.userId),
    index("conversation_members_user_idx").on(t.userId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: messageTypeEnum("type").notNull().default("text"),
    content: text("content").notNull(),
    ciphertext: text("ciphertext"),
    metadata: text("metadata"),
    replyToId: text("reply_to_id"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_sender_idx").on(t.senderId),
  ]
);

export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    initiatorId: text("initiator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: callTypeEnum("type").notNull().default("video"),
    status: callStatusEnum("status").notNull().default("ringing"),
    moqBroadcastName: text("moq_broadcast_name").notNull(),
    moqRelayUrl: text("moq_relay_url").notNull(),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("calls_conversation_idx").on(t.conversationId),
    index("calls_status_idx").on(t.status),
  ]
);

export const callParticipants = pgTable(
  "call_participants",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at"),
    leftAt: timestamp("left_at"),
    isMuted: boolean("is_muted").notNull().default(false),
    isVideoOff: boolean("is_video_off").notNull().default(false),
  },
  (t) => [
    uniqueIndex("call_participants_unique").on(t.callId, t.userId),
    index("call_participants_user_idx").on(t.userId),
  ]
);

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  status: text("status").default("Hey there! I'm using TheTextApp."),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  members: many(conversationMembers),
  messages: many(messages),
  calls: many(calls),
  creator: one(user, { fields: [conversations.createdBy], references: [user.id] }),
}));

export const conversationMembersRelations = relations(
  conversationMembers,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMembers.conversationId],
      references: [conversations.id],
    }),
    user: one(user, {
      fields: [conversationMembers.userId],
      references: [user.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, { fields: [messages.senderId], references: [user.id] }),
}));
