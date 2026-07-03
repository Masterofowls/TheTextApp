import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  deriveDirectKey,
  deriveGroupKey,
  decryptMessage,
  encryptMessage,
  generateGroupKey,
  generateIdentityKeyPair,
  getPublicKeyFromPrivate,
  parsePayload,
  serializePayload,
  unwrapGroupKeyForMember,
  wrapGroupKeyForMember,
} from "@thetextapp/crypto";
import { trpc } from "./trpc";

const IDENTITY_KEY_STORAGE = "thetextapp_identity_private_key";
const GROUP_KEY_PREFIX = "thetextapp_group_key_";

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export function useE2E() {
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const utils = trpc.useUtils();
  const registerKey = trpc.crypto.registerIdentityKey.useMutation();

  useEffect(() => {
    async function init() {
      let priv = await storageGet(IDENTITY_KEY_STORAGE);
      if (!priv) {
        const pair = generateIdentityKeyPair();
        priv = pair.privateKey;
        await storageSet(IDENTITY_KEY_STORAGE, priv);
        await registerKey.mutateAsync({ publicKey: pair.publicKey });
      } else {
        const publicKey = getPublicKeyFromPrivate(priv);
        const serverKey = await utils.client.crypto.getMyIdentityKey.query();
        if (!serverKey || serverKey.publicKey !== publicKey) {
          await registerKey.mutateAsync({ publicKey });
        }
      }
      setPrivateKey(priv);
      setReady(true);
    }
    init().catch(console.error);
  }, []);

  const getConversationKey = useCallback(
    async (
      conversationId: string,
      type: "direct" | "group",
      myUserId: string,
      memberUserIds: string[]
    ): Promise<Uint8Array | null> => {
      if (!privateKey) return null;

      if (type === "direct") {
        const otherId = memberUserIds.find((id) => id !== myUserId);
        if (!otherId) return null;
        const theirKey = await utils.client.crypto.getUserPublicKey.query({
          userId: otherId,
        });
        if (!theirKey?.publicKey || typeof theirKey.publicKey !== "string") {
          console.warn("[e2e] peer has no identity public key yet");
          return null;
        }
        try {
          return deriveDirectKey(privateKey, theirKey.publicKey, conversationId);
        } catch (err) {
          console.error("[e2e] failed to derive direct key", err);
          return null;
        }
      }

      const cached = await storageGet(`${GROUP_KEY_PREFIX}${conversationId}`);
      if (cached) return deriveGroupKey(cached, conversationId);

      const bundle = await utils.client.crypto.getMyGroupKeyBundle.query({
        conversationId,
      });
      if (!bundle) return null;

      const wrapped = parsePayload(bundle.wrappedKey);
      if (!wrapped) return null;

      const wrapperKey = await utils.client.crypto.getUserPublicKey.query({
        userId: bundle.wrappedByUserId,
      });
      if (!wrapperKey) return null;

      const groupKeyHex = unwrapGroupKeyForMember(
        wrapped,
        privateKey,
        wrapperKey.publicKey,
        conversationId
      );
      await storageSet(`${GROUP_KEY_PREFIX}${conversationId}`, groupKeyHex);
      return deriveGroupKey(groupKeyHex, conversationId);
    },
    [privateKey, utils.client]
  );

  const encrypt = useCallback(async (plaintext: string, key: Uint8Array) => {
    return serializePayload(encryptMessage(plaintext, key));
  }, []);

  const decrypt = useCallback((ciphertextJson: string | null, key: Uint8Array) => {
    if (!ciphertextJson) return null;
    const payload = parsePayload(ciphertextJson);
    if (!payload) return null;
    try {
      return decryptMessage(payload, key);
    } catch {
      return null;
    }
  }, []);

  const setupGroupKeys = useCallback(
    async (conversationId: string, myUserId: string, memberUserIds: string[]) => {
      if (!privateKey) return;
      const groupKeyHex = generateGroupKey();
      await storageSet(`${GROUP_KEY_PREFIX}${conversationId}`, groupKeyHex);

      const bundles = await Promise.all(
        memberUserIds.map(async (userId) => {
          const memberKey = await utils.client.crypto.getUserPublicKey.query({
            userId,
          });
          if (!memberKey) return null;
          const wrapped = wrapGroupKeyForMember(
            groupKeyHex,
            privateKey,
            memberKey.publicKey,
            conversationId
          );
          return { userId, wrappedKey: serializePayload(wrapped) };
        })
      );

      const valid = bundles.filter((b): b is NonNullable<typeof b> => b !== null);
      if (valid.length > 0) {
        await utils.client.crypto.storeGroupKeyBundle.mutate({
          conversationId,
          bundles: valid,
        });
      }
    },
    [privateKey, utils.client]
  );

  return { ready, privateKey, getConversationKey, encrypt, decrypt, setupGroupKeys };
}
