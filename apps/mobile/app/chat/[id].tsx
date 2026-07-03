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
  isSupabaseConfigured,
  subscribeToMessages,
  unsubscribeChannel,
} from "@/lib/supabase";
import Colors from "@/constants/Colors";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [text, setText] = useState("");
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

  const {
    data: messagesData,
    isLoading,
    refetch,
  } = trpc.message.list.useQuery(
    { conversationId: id!, limit: 50 },
    {
      enabled: !!id,
      refetchInterval: isSupabaseConfigured() ? false : 3_000,
    }
  );

  const markRead = trpc.conversation.markRead.useMutation();
  const sendMessage = trpc.message.send.useMutation({
    onSuccess: () => {
      setText("");
      refetch();
    },
  });

  const startCall = trpc.calls.start.useMutation({
    onSuccess: (call) => router.push(`/call/${call.id}`),
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
    const channel = subscribeToMessages(id, () => refetch());
    return () => unsubscribeChannel(channel);
  }, [id, refetch]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !id) return;

    if (convKey) {
      const ciphertext = await encrypt(text.trim(), convKey);
      sendMessage.mutate({
        conversationId: id,
        ciphertext,
        isEncrypted: true,
      });
    } else {
      sendMessage.mutate({ conversationId: id, content: text.trim() });
    }
  }, [text, id, convKey, encrypt, sendMessage]);

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
                <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                  {display}
                </Text>
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
          <TextInput
            style={styles.input}
            placeholder={convKey ? "Encrypted message..." : "Message..."}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={10000}
          />
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sendMessage.isPending}
          >
            <Ionicons name="send" size={20} color="#fff" />
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
