import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { trpc } from "@/lib/trpc";
import { useE2E } from "@/lib/use-e2e";
import { setWebActiveConversation } from "@/lib/web-notifications";
import {
  subscribeToMessages,
  unsubscribeChannel,
} from "@/lib/supabase";
import { navigatePush } from "@/lib/navigation";
import { subscribeConversationMessages } from "@/lib/message-events";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { pickFileAttachment, pickImageAttachment, attachmentMetaToJson } from "@/lib/attachments";
import { realtimeSocket } from "@/lib/realtime-ws";
import Colors from "@/constants/Colors";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [convKey, setConvKey] = useState<Uint8Array | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const listRef = useRef<FlatList>(null);
  const { ready: e2eReady, getConversationKey, encrypt, decrypt } = useE2E();

  const { data: me } = trpc.user.me.useQuery();
  const { data: conversation } = trpc.conversation.get.useQuery(
    { conversationId: id! },
    { enabled: !!id }
  );

  const memberIds = useMemo(
    () => conversation?.members.map((m) => m.userId) ?? [],
    [conversation]
  );

  const utils = trpc.useUtils();

  const {
    data: messagesData,
    isLoading,
    refetch,
  } = trpc.message.list.useQuery(
    { conversationId: id!, limit: 50 },
    {
      enabled: !!id,
      staleTime: 0,
      refetchInterval: false,
    }
  );

  const markRead = trpc.conversation.markRead.useMutation();
  const sendMessage = trpc.message.send.useMutation({
    onMutate: async (input) => {
      if (!id || !me) return;
      const preview = input.isEncrypted
        ? "🔒 Encrypted message"
        : (input.content?.trim() ?? "");
      const tempId = `pending-${Date.now()}`;
      await utils.message.list.cancel({ conversationId: id, limit: 50 });
      const previous = utils.message.list.getData({ conversationId: id, limit: 50 });
      utils.message.list.setData({ conversationId: id, limit: 50 }, (old) => ({
        messages: [
          ...(old?.messages ?? []),
          {
            id: tempId,
            conversationId: id,
            senderId: me.id,
            type: input.type ?? "text",
            content: preview,
            ciphertext: input.ciphertext ?? null,
            metadata: null,
            replyToId: input.replyToId ?? null,
            editedAt: null,
            deletedAt: null,
            createdAt: new Date(),
            sender: { name: me.name, image: me.image ?? null },
          },
        ],
        nextCursor: old?.nextCursor,
      }));
      return { previous, tempId };
    },
    onSuccess: (created, _input, context) => {
      utils.message.list.setData({ conversationId: id!, limit: 50 }, (old) => {
        if (!old) return old;
        const withoutPending = old.messages.filter((m) => m.id !== context?.tempId);
        if (withoutPending.some((m) => m.id === created.id)) {
          return { ...old, messages: withoutPending };
        }
        return {
          ...old,
          messages: [
            ...withoutPending,
            {
              ...created,
              sender: { name: me?.name ?? "You", image: me?.image ?? null },
            },
          ],
        };
      });
      void utils.conversation.list.refetch();
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.message.list.setData({ conversationId: id!, limit: 50 }, context.previous);
      }
    },
  });

  const uploadAttachment = trpc.attachment.upload.useMutation();

  const startCall = trpc.calls.start.useMutation({
    onSuccess: (call) => navigatePush(router, `/call/${call.id}`),
  });

  useEffect(() => {
    if (id) markRead.mutate({ conversationId: id });
  }, [id]);

  useEffect(() => {
    if (Platform.OS !== "web" || !id) return;
    setWebActiveConversation(id);
    return () => setWebActiveConversation(null);
  }, [id]);

  useEffect(() => {
    if (!e2eReady || !id || !conversation || !me) return;
    getConversationKey(id, conversation.type, me.id, memberIds)
      .then(setConvKey)
      .catch((err) => console.error("[e2e] conversation key error", err));
  }, [e2eReady, id, conversation, me, memberIds, getConversationKey]);

  useEffect(() => {
    if (!convKey || !messagesData?.messages) return;
    const next: Record<string, string> = {};
    for (const msg of messagesData.messages) {
      if (msg.ciphertext) {
        const plain = decrypt(msg.ciphertext, convKey);
        if (plain) next[msg.id] = plain;
      }
    }
    setDecrypted(next);
  }, [messagesData, convKey, decrypt]);

  useEffect(() => {
    if (!id) return;

    const refreshMessages = () => {
      void refetch();
      markRead.mutate({ conversationId: id });
    };

    const unsubEvents = subscribeConversationMessages(id, refreshMessages);
    const unsubWs = realtimeSocket.onEvent((event) => {
      if (event.type === "message" && event.conversationId === id) {
        refreshMessages();
      }
    });

    const channel = subscribeToMessages(id, refreshMessages);

    return () => {
      unsubEvents();
      unsubWs();
      unsubscribeChannel(channel);
    };
  }, [id, refetch]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !id || !me) return;

    const trimmed = text.trim();
    setText("");

    if (convKey) {
      const ciphertext = await encrypt(trimmed, convKey);
      sendMessage.mutate({
        conversationId: id,
        ciphertext,
        isEncrypted: true,
      });
    } else {
      sendMessage.mutate({ conversationId: id, content: trimmed });
    }
  }, [text, id, me, convKey, encrypt, sendMessage]);

  const sendAttachment = useCallback(
    async (kind: "image" | "file") => {
      if (!id || !me || uploading) return;
      try {
        setUploading(true);
        const picked =
          kind === "image" ? await pickImageAttachment() : await pickFileAttachment();
        if (!picked) return;

        const { meta } = await uploadAttachment.mutateAsync({
          conversationId: id,
          fileName: picked.fileName,
          mimeType: picked.mimeType,
          dataBase64: picked.base64,
          width: picked.width,
          height: picked.height,
        });

        sendMessage.mutate({
          conversationId: id,
          type: picked.kind,
          content: kind === "image" ? `📷 ${picked.fileName}` : `📎 ${picked.fileName}`,
          metadata: attachmentMetaToJson(meta),
        });
      } catch (err) {
        console.error("[chat] attachment error", err);
        alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [id, me, uploading, uploadAttachment, sendMessage]
  );

  const title =
    conversation?.type === "group"
      ? conversation.title
      : conversation?.members.find((m) => m.userId !== me?.id)?.displayName ??
        conversation?.members.find((m) => m.userId !== me?.id)?.name ??
        "Chat";

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: title ?? "Chat",
          headerRight: () => (
            <View style={styles.headerActions}>
              {convKey && (
                <Ionicons
                  name="lock-closed"
                  size={16}
                  color="#22c55e"
                  style={{ marginRight: 4 }}
                />
              )}
              <Pressable
                onPress={() =>
                  startCall.mutate({ conversationId: id!, type: "audio" })
                }
                style={styles.headerBtn}
              >
                <Ionicons name="call" size={22} color={Colors.light.tint} />
              </Pressable>
              <Pressable
                onPress={() =>
                  startCall.mutate({ conversationId: id!, type: "video" })
                }
                style={styles.headerBtn}
              >
                <Ionicons name="videocam" size={22} color={Colors.light.tint} />
              </Pressable>
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {convKey && (
          <View style={styles.e2eBanner}>
            <Ionicons name="shield-checkmark" size={14} color="#22c55e" />
            <Text style={styles.e2eText}>End-to-end encrypted</Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messagesData?.messages ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => {
            const isMine = item.senderId === me?.id;
            const display =
              decrypted[item.id] ??
              (item.ciphertext ? "🔒 Unable to decrypt" : item.content);

            return (
              <Animated.View
                entering={FadeInDown.delay(index * 20).duration(200)}
                style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                {!isMine && conversation?.type === "group" && (
                  <Text style={styles.senderName}>{item.sender?.name}</Text>
                )}
                <ChatMessageContent
                  message={{ ...item, conversationId: id! }}
                  displayText={display}
                  isMine={isMine}
                />
                <Text style={[styles.time, isMine && styles.timeMine]}>
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </Animated.View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <Pressable
            style={styles.attachBtn}
            onPress={() => void sendAttachment("image")}
            disabled={uploading || sendMessage.isPending}
            accessibilityLabel="Send image"
          >
            <Ionicons name="image-outline" size={22} color={Colors.light.tint} />
          </Pressable>
          <Pressable
            style={styles.attachBtn}
            onPress={() => void sendAttachment("file")}
            disabled={uploading || sendMessage.isPending}
            accessibilityLabel="Send file"
          >
            <Ionicons name="attach" size={22} color={Colors.light.tint} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder={convKey ? "Encrypted message..." : "Message..."}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={10000}
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() || uploading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sendMessage.isPending || uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e2e8f0" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  e2eBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    backgroundColor: "#f0fdf4",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#bbf7d0",
  },
  e2eText: { fontSize: 12, color: "#15803d", fontWeight: "500" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12, marginRight: 8 },
  headerBtn: { padding: 4 },
  messageList: { padding: 16, gap: 8 },
  bubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: Colors.light.tint,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
  },
  senderName: { fontSize: 12, color: Colors.light.tint, marginBottom: 4, fontWeight: "600" },
  messageText: { fontSize: 16, color: "#0f172a" },
  messageTextMine: { color: "#fff" },
  time: { fontSize: 10, color: "#64748b", marginTop: 4, alignSelf: "flex-end" },
  timeMine: { color: "rgba(255,255,255,0.7)" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#cbd5e1",
    gap: 8,
  },
  attachBtn: { padding: 8, justifyContent: "center", alignItems: "center" },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
});
