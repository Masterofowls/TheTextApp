import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  conversationKeyBundles,
  conversationMembers,
  conversations,
  userIdentityKeys,
} from "@thetextapp/db";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";

function generateId() {
  return crypto.randomUUID();
}

export const cryptoRouter = router({
  registerIdentityKey: protectedProcedure
    .input(
      z.object({
        publicKey: z.string().min(64).max(128),
        keyVersion: z.string().default("1"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(userIdentityKeys)
        .where(
          and(
            eq(userIdentityKeys.userId, ctx.userId),
            eq(userIdentityKeys.keyVersion, input.keyVersion)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await ctx.db
          .update(userIdentityKeys)
          .set({ publicKey: input.publicKey, rotatedAt: new Date() })
          .where(eq(userIdentityKeys.id, existing[0]!.id));
        return { id: existing[0]!.id, updated: true };
      }

      const id = generateId();
      await ctx.db.insert(userIdentityKeys).values({
        id,
        userId: ctx.userId,
        publicKey: input.publicKey,
        keyVersion: input.keyVersion,
      });

      return { id, updated: false };
    }),

  getMyIdentityKey: protectedProcedure.query(async ({ ctx }) => {
    const [key] = await ctx.db
      .select()
      .from(userIdentityKeys)
      .where(eq(userIdentityKeys.userId, ctx.userId))
      .orderBy(desc(userIdentityKeys.createdAt))
      .limit(1);

    return key ?? null;
  }),

  getUserPublicKey: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [key] = await ctx.db
        .select({
          userId: userIdentityKeys.userId,
          publicKey: userIdentityKeys.publicKey,
          keyVersion: userIdentityKeys.keyVersion,
        })
        .from(userIdentityKeys)
        .where(eq(userIdentityKeys.userId, input.userId))
        .orderBy(desc(userIdentityKeys.createdAt))
        .limit(1);

      return key ?? null;
    }),

  getConversationMemberKeys: protectedProcedure
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

      const members = await ctx.db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, input.conversationId));

      const memberIds = members.map((m) => m.userId);
      if (memberIds.length === 0) return [];

      const keys = await ctx.db
        .select({
          userId: userIdentityKeys.userId,
          publicKey: userIdentityKeys.publicKey,
          keyVersion: userIdentityKeys.keyVersion,
        })
        .from(userIdentityKeys)
        .where(inArray(userIdentityKeys.userId, memberIds));

      return keys;
    }),

  storeGroupKeyBundle: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        bundles: z.array(
          z.object({
            userId: z.string(),
            wrappedKey: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [conv] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);

      if (!conv || conv.type !== "group") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a group conversation" });
      }

      for (const bundle of input.bundles) {
        const existing = await ctx.db
          .select()
          .from(conversationKeyBundles)
          .where(
            and(
              eq(conversationKeyBundles.conversationId, input.conversationId),
              eq(conversationKeyBundles.userId, bundle.userId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await ctx.db
            .update(conversationKeyBundles)
            .set({
              wrappedKey: bundle.wrappedKey,
              wrappedByUserId: ctx.userId,
            })
            .where(eq(conversationKeyBundles.id, existing[0]!.id));
        } else {
          await ctx.db.insert(conversationKeyBundles).values({
            id: generateId(),
            conversationId: input.conversationId,
            userId: bundle.userId,
            wrappedKey: bundle.wrappedKey,
            wrappedByUserId: ctx.userId,
          });
        }
      }

      return { success: true };
    }),

  getMyGroupKeyBundle: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [bundle] = await ctx.db
        .select()
        .from(conversationKeyBundles)
        .where(
          and(
            eq(conversationKeyBundles.conversationId, input.conversationId),
            eq(conversationKeyBundles.userId, ctx.userId)
          )
        )
        .limit(1);

      return bundle ?? null;
    }),
});
