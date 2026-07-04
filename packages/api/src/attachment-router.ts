import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { conversationMembers } from "@thetextapp/db";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  attachmentMetaSchema,
} from "./attachment-types.js";
import { createAttachmentSignedUrl, uploadAttachment } from "./attachment-storage.js";
import type { Database } from "@thetextapp/db";
import { protectedProcedure, router } from "./trpc.js";

function generateId() {
  return crypto.randomUUID();
}

async function assertMembership(db: Database, conversationId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!membership) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }
}

export const attachmentRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(127),
        dataBase64: z.string().min(1),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMembership(ctx.db, input.conversationId, ctx.userId);

      const bytes = Uint8Array.from(atob(input.dataBase64), (c) => c.charCodeAt(0));
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit`,
        });
      }

      const safeName = input.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
      const storageKey = `${input.conversationId}/${generateId()}/${safeName}`;

      await uploadAttachment({
        storageKey,
        bytes,
        mimeType: input.mimeType,
      });

      const meta = attachmentMetaSchema.parse({
        storageKey,
        mimeType: input.mimeType,
        fileName: safeName,
        sizeBytes: bytes.byteLength,
        width: input.width,
        height: input.height,
      });

      return { meta, bucket: ATTACHMENT_BUCKET };
    }),

  getUrl: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        storageKey: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertMembership(ctx.db, input.conversationId, ctx.userId);

      if (!input.storageKey.startsWith(`${input.conversationId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid attachment path" });
      }

      const url = await createAttachmentSignedUrl(input.storageKey);
      return { url };
    }),
});
