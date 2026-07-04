import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { AttachmentMeta } from "@thetextapp/api/attachment-types";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type PickedAttachment = {
  fileName: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  kind: "image" | "file";
};

async function readWebFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function pickImageAttachment(): Promise<PickedAttachment | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("Image exceeds 5MB limit");
        }
        const base64 = await readWebFileAsBase64(file);
        resolve({
          fileName: file.name || "image.jpg",
          mimeType: file.type || "image/jpeg",
          base64,
          sizeBytes: file.size,
          kind: "image",
        });
      };
      input.click();
    });
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Photo library permission denied");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    base64: true,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error("Could not read image data");

  const bytes = Math.ceil((asset.base64.length * 3) / 4);
  if (bytes > MAX_ATTACHMENT_BYTES) throw new Error("Image exceeds 5MB limit");

  return {
    fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    base64: asset.base64,
    sizeBytes: bytes,
    width: asset.width,
    height: asset.height,
    kind: "image",
  };
}

export async function pickFileAttachment(): Promise<PickedAttachment | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("File exceeds 5MB limit");
        }
        const base64 = await readWebFileAsBase64(file);
        resolve({
          fileName: file.name || "file",
          mimeType: file.type || "application/octet-stream",
          base64,
          sizeBytes: file.size,
          kind: "file",
        });
      };
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const uri = asset.uri;
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("File exceeds 5MB limit");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return {
    fileName: asset.name ?? `file-${Date.now()}`,
    mimeType: asset.mimeType ?? "application/octet-stream",
    base64: btoa(binary),
    sizeBytes: buffer.byteLength,
    kind: "file",
  };
}

export function attachmentMetaToJson(meta: AttachmentMeta): string {
  return JSON.stringify(meta);
}
