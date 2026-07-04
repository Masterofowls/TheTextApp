import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET } from "./attachment-types.js";

let adminClient: SupabaseClient | null = null;

function getAdmin(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

export async function uploadAttachment(params: {
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<void> {
  const admin = getAdmin();
  if (!admin) {
    throw new Error(
      "Attachment storage is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API)"
    );
  }

  const { error } = await admin.storage.from(ATTACHMENT_BUCKET).upload(params.storageKey, params.bytes, {
    contentType: params.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

export async function createAttachmentSignedUrl(
  storageKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  const admin = getAdmin();
  if (!admin) {
    throw new Error("Attachment storage is not configured");
  }

  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create download URL");
  }

  return data.signedUrl;
}
