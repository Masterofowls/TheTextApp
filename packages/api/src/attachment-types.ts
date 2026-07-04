import { z } from "zod";

export const attachmentMetaSchema = z.object({
  storageKey: z.string(),
  mimeType: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

export function parseAttachmentMeta(raw: string | null | undefined): AttachmentMeta | null {
  if (!raw) return null;
  try {
    const parsed = attachmentMetaSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const ATTACHMENT_BUCKET = "message-attachments";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
