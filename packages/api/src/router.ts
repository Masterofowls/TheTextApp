import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  calls,
  callParticipants,
  conversationMembers,
  conversations,
  messages,
  pushTokens,
  user,
  userProfiles,
} from "@thetextapp/db";
import type { Database } from "@thetextapp/db";
import { TRPCError } from "@trpc/server";
import { resolveMoqRelayUrl } from "./moq-relay.js";
import { protectedProcedure, router } from "./trpc";

function generateId() {
  return crypto.randomUUID();
}

async function memberIdsExcept(db: Database, conversationId: string, excludeUserId?: string) {
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return members.map((m) => m.userId).filter((id) => id !== excludeUserId);
}

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, ctx.userId))
      .limit(1);

    return {
      ...ctx.session.user,
      profile: profile ?? null,
    };
  }),

  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = `%${input.query.toLowerCase()}%`;
      const results = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          displayUsername: user.displayUsername,
          image: user.image,
          displayName: userProfiles.displayName,
          avatarUrl: userProfiles.avatarUrl,
          status: userProfiles.status,
        })
        .from(user)
        .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
        .where(
          and(
            sql`lower(${user.name}) like ${q}
              or lower(coalesce(${user.username}, '')) like ${q}
              or lower(coalesce(${user.displayUsername}, '')) like ${q}
              or lower(${user.email}) like ${q}`,
            sql`${user.id} != ${ctx.userId}`
          )
        )
        .limit(20);

      return results;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(80).optional(),
        bio: z.string().max(500).optional(),
        status: z.string().max(200).optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, ctx.userId))
        .limit(1);

      if (existing.length === 0) {
        await ctx.db.insert(userProfiles).values({
          userId: ctx.userId,
          displayName: input.displayName ?? ctx.session.user.name,
          bio: input.bio,
          status: input.status,
          avatarUrl: input.avatarUrl,
        });
      } else {
        await ctx.db
          .update(userProfiles)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.userId, ctx.userId));
      }

      return { success: true };
    }),

  registerPushToken: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
        platform: z.enum(["ios", "android", "web"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(pushTokens)
        .where(eq(pushTokens.token, input.token))
        .limit(1);

      if (existing.length > 0) {
        await ctx.db
          .update(pushTokens)
          .set({ userId: ctx.userId, platform: input.platform, updatedAt: new Date() })
          .where(eq(pushTokens.id, existing[0]!.id));
        return { id: existing[0]!.id, updated: true };
      }

      const id = generateId();
      await ctx.db.insert(pushTokens).values({
        id,
        userId: ctx.userId,
        token: input.token,
        platform: input.platform,
      });
      return { id, updated: false };
    }),
});

export const conversationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        conversation: conversations,
        member: conversationMembers,
      })
      .from(conversationMembers)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationMembers.conversationId)
      )
      .where(eq(conversationMembers.userId, ctx.userId))
      .orderBy(desc(conversations.updatedAt));

    const conversationIds = memberships.map((m) => m.conversation.id);

    if (conversationIds.length === 0) {
      return [];
    }

    const lastMessages = await ctx.db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt));

    const lastByConversation = new Map<string, (typeof lastMessages)[0]>();
    for (const msg of lastMessages) {
      if (!lastByConversation.has(msg.conversationId)) {
        lastByConversation.set(msg.conversationId, msg);
      }
    }

    const allMembers = await ctx.db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: user.id,
        name: user.name,
        image: user.image,
        displayName: userProfiles.displayName,
      })
      .from(conversationMembers)
      .innerJoin(user, eq(user.id, conversationMembers.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
      .where(inArray(conversationMembers.conversationId, conversationIds));

    return memberships.map(({ conversation, member }) => ({
      ...conversation,
      lastMessage: lastByConversation.get(conversation.id) ?? null,
      members: allMembers.filter((m) => m.conversationId === conversation.id),
      unread: member.lastReadAt
        ? (lastByConversation.get(conversation.id)?.createdAt ?? new Date(0)) >
          member.lastReadAt
        : !!lastByConversation.get(conversation.id),
    }));
  }),

  get: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const [conversation] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);

      const members = await ctx.db
        .select({
          userId: user.id,
          name: user.name,
          image: user.image,
          displayName: userProfiles.displayName,
          role: conversationMembers.role,
        })
        .from(conversationMembers)
        .innerJoin(user, eq(user.id, conversationMembers.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
        .where(eq(conversationMembers.conversationId, input.conversationId));

      return { ...conversation, members };
    }),

  createDirect: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot create conversation with yourself",
        });
      }

      const myConversations = await ctx.db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, ctx.userId));

      const theirConversations = await ctx.db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, input.userId));

      const myIds = new Set(myConversations.map((c) => c.conversationId));
      const shared = theirConversations.find((c) => myIds.has(c.conversationId));

      if (shared) {
        const [existing] = await ctx.db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.id, shared.conversationId),
              eq(conversations.type, "direct")
            )
          )
          .limit(1);
        if (existing) return existing;
      }

      const conversationId = generateId();
      await ctx.db.insert(conversations).values({
        id: conversationId,
        type: "direct",
        createdBy: ctx.userId,
      });

      await ctx.db.insert(conversationMembers).values([
        { id: generateId(), conversationId, userId: ctx.userId },
        { id: generateId(), conversationId, userId: input.userId },
      ]);

      const [created] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      ctx.realtime?.publishToUsers([input.userId], {
        type: "conversation_created",
        conversationId,
        conversationType: "direct",
        title: null,
        createdBy: ctx.userId,
        creatorName: ctx.session.user.name,
      });

      return created;
    }),

  createGroup: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        memberIds: z.array(z.string()).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversationId = generateId();
      const uniqueMembers = [...new Set([ctx.userId, ...input.memberIds])];

      await ctx.db.insert(conversations).values({
        id: conversationId,
        type: "group",
        title: input.title,
        createdBy: ctx.userId,
      });

      await ctx.db.insert(conversationMembers).values(
        uniqueMembers.map((userId) => ({
          id: generateId(),
          conversationId,
          userId,
          role: userId === ctx.userId ? "admin" : "member",
        }))
      );

      const [created] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      const recipients = uniqueMembers.filter((id) => id !== ctx.userId);
      ctx.realtime?.publishToUsers(recipients, {
        type: "conversation_created",
        conversationId,
        conversationType: "group",
        title: input.title,
        createdBy: ctx.userId,
        creatorName: ctx.session.user.name,
      });

      return created;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        );
      return { success: true };
    }),
});

export const messageRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const conditions = [
        eq(messages.conversationId, input.conversationId),
        sql`${messages.deletedAt} is null`,
      ];

      if (input.cursor) {
        conditions.push(sql`${messages.createdAt} < ${input.cursor}`);
      }

      const rows = await ctx.db
        .select({
          message: messages,
          senderName: user.name,
          senderImage: user.image,
        })
        .from(messages)
        .innerJoin(user, eq(user.id, messages.senderId))
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        messages: items.reverse().map((r) => ({
          ...r.message,
          sender: { name: r.senderName, image: r.senderImage },
        })),
        nextCursor: hasMore
          ? items[items.length - 1]?.message.createdAt.toISOString()
          : undefined,
      };
    }),

  send: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string().max(10000).optional(),
        ciphertext: z.string().max(50000).optional(),
        isEncrypted: z.boolean().default(false),
        type: z.enum(["text", "image", "file", "system"]).default("text"),
        replyToId: z.string().optional(),
        metadata: z.string().max(8000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      if (input.isEncrypted && !input.ciphertext) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Encrypted messages require ciphertext",
        });
      }

      if (!input.isEncrypted && !input.content?.trim() && input.type === "text") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message content required" });
      }

      if ((input.type === "image" || input.type === "file") && !input.metadata) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attachments require metadata",
        });
      }

      if (!input.isEncrypted && input.type !== "text" && !input.content?.trim()) {
        input.content = input.type === "image" ? "📷 Image" : "📎 File";
      }

      const messageId = generateId();
      const now = new Date();

      await ctx.db.insert(messages).values({
        id: messageId,
        conversationId: input.conversationId,
        senderId: ctx.userId,
        type: input.type,
        content: input.isEncrypted ? "🔒 Encrypted message" : input.content!,
        ciphertext: input.isEncrypted ? input.ciphertext : null,
        metadata: input.metadata ?? null,
        replyToId: input.replyToId,
        createdAt: now,
      });

      await ctx.db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, input.conversationId));

      const [created] = await ctx.db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      const recipients = await memberIdsExcept(ctx.db, input.conversationId, ctx.userId);
      ctx.realtime?.publishToUsers(recipients, {
        type: "message",
        conversationId: input.conversationId,
        messageId,
        preview: input.isEncrypted ? "🔒 Encrypted message" : input.content!.trim(),
        senderName: ctx.session.user.name,
        senderId: ctx.userId,
      });

      return created;
    }),
});

export const callRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        type: z.enum(["audio", "video"]).default("video"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const callId = generateId();
      const broadcastName = `call-${callId}`;
      const relayUrl = resolveMoqRelayUrl();

      await ctx.db.insert(calls).values({
        id: callId,
        conversationId: input.conversationId,
        initiatorId: ctx.userId,
        type: input.type,
        status: "ringing",
        moqBroadcastName: broadcastName,
        moqRelayUrl: relayUrl,
      });

      const members = await ctx.db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, input.conversationId));

      await ctx.db.insert(callParticipants).values(
        members.map((m) => ({
          id: generateId(),
          callId,
          userId: m.userId,
          joinedAt: m.userId === ctx.userId ? new Date() : null,
        }))
      );

      await ctx.db.insert(messages).values({
        id: generateId(),
        conversationId: input.conversationId,
        senderId: ctx.userId,
        type: "call",
        content: JSON.stringify({
          callId,
          type: input.type,
          action: "started",
        }),
      });

      const [created] = await ctx.db
        .select()
        .from(calls)
        .where(eq(calls.id, callId))
        .limit(1);

      const recipients = await memberIdsExcept(ctx.db, input.conversationId, ctx.userId);
      ctx.realtime?.publishToUsers(recipients, {
        type: "incoming_call",
        callId,
        conversationId: input.conversationId,
        callType: input.type,
        initiatorName: ctx.session.user.name,
        initiatorId: ctx.userId,
      });

      return created;
    }),

  answer: protectedProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [call] = await ctx.db
        .select()
        .from(calls)
        .where(eq(calls.id, input.callId))
        .limit(1);

      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      await ctx.db
        .update(calls)
        .set({ status: "active", startedAt: new Date() })
        .where(eq(calls.id, input.callId));

      await ctx.db
        .update(callParticipants)
        .set({ joinedAt: new Date() })
        .where(
          and(
            eq(callParticipants.callId, input.callId),
            eq(callParticipants.userId, ctx.userId)
          )
        );

      ctx.realtime?.publishToUsers([call.initiatorId], {
        type: "call_answered",
        callId: call.id,
        conversationId: call.conversationId,
        answeredByUserId: ctx.userId,
        answeredByName: ctx.session.user.name,
      });

      return { success: true, call };
    }),

  decline: protectedProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [call] = await ctx.db
        .select()
        .from(calls)
        .where(eq(calls.id, input.callId))
        .limit(1);

      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      await ctx.db
        .update(calls)
        .set({ status: "declined", endedAt: new Date() })
        .where(eq(calls.id, input.callId));

      const recipients = await memberIdsExcept(ctx.db, call.conversationId, ctx.userId);
      ctx.realtime?.publishToUsers(recipients, {
        type: "call_ended",
        callId: call.id,
        conversationId: call.conversationId,
      });

      return { success: true };
    }),

  end: protectedProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [call] = await ctx.db
        .select()
        .from(calls)
        .where(eq(calls.id, input.callId))
        .limit(1);

      await ctx.db
        .update(calls)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(calls.id, input.callId));

      await ctx.db
        .update(callParticipants)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(callParticipants.callId, input.callId),
            eq(callParticipants.userId, ctx.userId)
          )
        );

      if (call) {
        const recipients = await memberIdsExcept(ctx.db, call.conversationId, ctx.userId);
        ctx.realtime?.publishToUsers(recipients, {
          type: "call_ended",
          callId: call.id,
          conversationId: call.conversationId,
        });
      }

      return { success: true };
    }),

  getActive: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [active] = await ctx.db
        .select()
        .from(calls)
        .where(
          and(
            eq(calls.conversationId, input.conversationId),
            or(eq(calls.status, "ringing"), eq(calls.status, "active"))
          )
        )
        .orderBy(desc(calls.createdAt))
        .limit(1);

      return active ?? null;
    }),

  /** Ringing calls where the current user has not joined yet (missed WS events). */
  listRinging: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        callId: calls.id,
        conversationId: calls.conversationId,
        callType: calls.type,
        initiatorId: calls.initiatorId,
        initiatorName: user.name,
      })
      .from(callParticipants)
      .innerJoin(calls, eq(callParticipants.callId, calls.id))
      .innerJoin(user, eq(calls.initiatorId, user.id))
      .where(
        and(
          eq(callParticipants.userId, ctx.userId),
          eq(calls.status, "ringing"),
          isNull(callParticipants.joinedAt),
          ne(calls.initiatorId, ctx.userId)
        )
      )
      .orderBy(desc(calls.createdAt));

    return rows.map((row) => ({
      type: "incoming_call" as const,
      callId: row.callId,
      conversationId: row.conversationId,
      callType: row.callType,
      initiatorId: row.initiatorId,
      initiatorName: row.initiatorName,
    }));
  }),

  getMoqToken: protectedProcedure
    .input(z.object({ callId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [participant] = await ctx.db
        .select()
        .from(callParticipants)
        .where(
          and(
            eq(callParticipants.callId, input.callId),
            eq(callParticipants.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a participant in this call",
        });
      }

      const [call] = await ctx.db
        .select()
        .from(calls)
        .where(eq(calls.id, input.callId))
        .limit(1);

      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      const participants = await ctx.db
        .select({ userId: callParticipants.userId })
        .from(callParticipants)
        .where(eq(callParticipants.callId, input.callId));

      const peerUserId = participants.find((p) => p.userId !== ctx.userId)?.userId;
      if (!peerUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Call has no remote participant",
        });
      }

      // MoQ token: signed JWT-like payload for relay auth (production: use @moq/token)
      const payload = {
        sub: ctx.userId,
        callId: call.id,
        broadcast: call.moqBroadcastName,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      return {
        relayUrl: resolveMoqRelayUrl(call.moqRelayUrl),
        broadcastName: call.moqBroadcastName,
        peerUserId,
        token: btoa(JSON.stringify(payload)),
        call,
      };
    }),
});

import { cryptoRouter } from "./crypto-router.js";
import { attachmentRouter } from "./attachment-router.js";

export const appRouter = router({
  user: userRouter,
  conversation: conversationRouter,
  message: messageRouter,
  attachment: attachmentRouter,
  calls: callRouter,
  crypto: cryptoRouter,
});

export type AppRouter = typeof appRouter;
