import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { parseAttachmentMeta } from "@thetextapp/api/attachment-types";
import { trpc } from "@/lib/trpc";

type Message = {
  id: string;
  type: string;
  content: string;
  metadata: string | null;
  conversationId: string;
};

type Props = {
  message: Message;
  displayText: string;
  isMine: boolean;
};

export function ChatMessageContent({ message, displayText, isMine }: Props) {
  const meta = parseAttachmentMeta(message.metadata);
  const needsUrl = message.type === "image" || message.type === "file";
  const { data } = trpc.attachment.getUrl.useQuery(
    {
      conversationId: message.conversationId,
      storageKey: meta?.storageKey ?? "",
    },
    { enabled: needsUrl && Boolean(meta?.storageKey) }
  );

  if (message.type === "image" && meta && data?.url) {
    return (
      <View>
        <Image
          source={{ uri: data.url }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={meta.fileName}
        />
        {displayText && displayText !== "📷 Image" ? (
          <Text style={[styles.caption, isMine && styles.captionMine]}>{displayText}</Text>
        ) : null}
      </View>
    );
  }

  if (message.type === "file" && meta) {
    return (
      <Pressable
        style={styles.fileRow}
        onPress={() => {
          if (data?.url) void Linking.openURL(data.url);
        }}
        disabled={!data?.url}
      >
        <Ionicons name="document-attach" size={22} color={isMine ? "#fff" : "#334155"} />
        <View style={styles.fileMeta}>
          <Text style={[styles.fileName, isMine && styles.fileNameMine]} numberOfLines={2}>
            {meta.fileName}
          </Text>
          <Text style={[styles.fileSize, isMine && styles.fileSizeMine]}>
            {(meta.sizeBytes / 1024).toFixed(0)} KB
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{displayText}</Text>
  );
}

const styles = StyleSheet.create({
  messageText: { fontSize: 16, color: "#0f172a" },
  messageTextMine: { color: "#fff" },
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: "#cbd5e1",
  },
  caption: { fontSize: 14, color: "#0f172a", marginTop: 6 },
  captionMine: { color: "#fff" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 240 },
  fileMeta: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  fileNameMine: { color: "#fff" },
  fileSize: { fontSize: 12, color: "#64748b", marginTop: 2 },
  fileSizeMine: { color: "rgba(255,255,255,0.75)" },
});
