import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useE2E } from "@/lib/use-e2e";
import { formatUserHandle } from "@/lib/auth-username";
import Colors from "@/constants/Colors";

export default function NewChatScreen() {
  const router = useRouter();
  const { setupGroupKeys } = useE2E();
  const { data: me } = trpc.user.me.useQuery();
  const [query, setQuery] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"direct" | "group">("direct");

  const { data: results, isFetching } = trpc.user.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  const createDirect = trpc.conversation.createDirect.useMutation({
    onSuccess: (conv) => {
      router.replace(`/chat/${conv.id}`);
    },
    onError: (error) => {
      Alert.alert("Could not start chat", error.message);
    },
  });

  const createGroup = trpc.conversation.createGroup.useMutation({
    onSuccess: async (conv) => {
      if (me) {
        const memberIds = [...selected, me.id];
        await setupGroupKeys(conv.id, me.id, memberIds);
      }
      router.replace(`/chat/${conv.id}`);
    },
  });

  function toggleUser(userId: string) {
    if (mode === "direct") {
      if (me?.id === userId) {
        Alert.alert("Cannot chat with yourself", "Pick another user to start a direct chat.");
        return;
      }
      createDirect.mutate({ userId });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleCreateGroup() {
    if (!groupTitle.trim() || selected.size === 0) return;
    createGroup.mutate({
      title: groupTitle.trim(),
      memberIds: Array.from(selected),
    });
  }

  const isPending = createDirect.isPending || createGroup.isPending;

  return (
    <>
      <Stack.Screen options={{ title: "New Chat", presentation: "modal" }} />
      <View style={styles.container}>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === "direct" && styles.modeBtnActive]}
            onPress={() => setMode("direct")}
          >
            <Text style={[styles.modeText, mode === "direct" && styles.modeTextActive]}>
              Direct
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === "group" && styles.modeBtnActive]}
            onPress={() => setMode("group")}
          >
            <Text style={[styles.modeText, mode === "group" && styles.modeTextActive]}>
              Group
            </Text>
          </Pressable>
        </View>

        {mode === "group" && (
          <TextInput
            style={styles.input}
            placeholder="Group name"
            value={groupTitle}
            onChangeText={setGroupTitle}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Search users..."
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />

        {isFetching && <ActivityIndicator color={Colors.light.tint} />}

        <FlatList
          data={results ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => toggleUser(item.id)}
                disabled={isPending}
              >
                <Text style={styles.name}>{item.displayName ?? item.name}</Text>
                {formatUserHandle(item) ? (
                  <Text style={styles.handle}>{formatUserHandle(item)}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />

        {mode === "group" && selected.size > 0 && (
          <Pressable
            style={styles.createBtn}
            onPress={handleCreateGroup}
            disabled={isPending}
          >
            <Text style={styles.createBtnText}>
              Create group ({selected.size} members)
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: Colors.light.tint },
  modeText: { fontWeight: "500", color: "#64748b" },
  modeTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowSelected: { borderColor: Colors.light.tint, backgroundColor: "#f0f9ff" },
  name: { fontSize: 16, fontWeight: "500" },
  handle: { color: "#64748b", fontSize: 13 },
  createBtn: {
    backgroundColor: Colors.light.tint,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  createBtnText: { color: "#fff", fontWeight: "600" },
});
