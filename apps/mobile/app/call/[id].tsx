import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MoqCallClient, isRelayReachableError, relaySetupHint } from "@thetextapp/moq";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";

export default function CallScreen() {
  const { id: callId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const moqRef = useRef<MoqCallClient | null>(null);
  const [callState, setCallState] = useState<string>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const pulse = useSharedValue(1);

  const { data: moqConfig, isLoading } = trpc.calls.getMoqToken.useQuery(
    { callId: callId! },
    { enabled: !!callId }
  );

  const { data: call } = trpc.calls.getActive.useQuery(
    { conversationId: moqConfig?.call.conversationId ?? "" },
    { enabled: !!moqConfig?.call.conversationId }
  );

  const answerCall = trpc.calls.answer.useMutation();
  const endCall = trpc.calls.end.useMutation({
    onSuccess: () => router.back(),
  });

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 1000 }), -1, true);
  }, [pulse]);

  useEffect(() => {
    if (!moqConfig || Platform.OS !== "web") return;

    const client = new MoqCallClient({
      onStateChange: setCallState,
      onError: (err) => Alert.alert("Call error", err.message),
    });
    moqRef.current = client;

    const isInitiator = moqConfig.call.initiatorId === session?.user?.id;

    async function connect() {
      try {
        if (!isInitiator) {
          await answerCall.mutateAsync({ callId: callId! });
        }

        const config = {
          relayUrl: moqConfig!.relayUrl,
          broadcastName: moqConfig!.broadcastName,
          token: moqConfig!.token,
          audio: true,
          video: call?.type === "video",
        };

        if (isInitiator) {
          await client.startPublish(config);
        } else {
          await client.startSubscribe(config);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? isRelayReachableError(err)
              ? `${err.message}\n\n${relaySetupHint()}`
              : err.message
            : "MoQ connection failed";
        console.error("MoQ connection failed:", err);
        Alert.alert("Call connection failed", message);
      }
    }

    connect();

    return () => {
      client.end();
    };
  }, [moqConfig, session?.user?.id, callId, call?.type]);

  async function handleEndCall() {
    await moqRef.current?.end();
    endCall.mutate({ callId: callId! });
  }

  if (isLoading || !moqConfig) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.statusText}>Connecting call...</Text>
      </View>
    );
  }

  const isVideo = call?.type === "video";

  return (
    <View style={styles.container}>
      <View style={styles.videoArea}>
        {Platform.OS === "web" ? (
          <View style={styles.remoteVideo}>
            <Animated.View style={[styles.avatarPulse, pulseStyle]}>
              <Ionicons name="person" size={64} color="#94a3b8" />
            </Animated.View>
            <Text style={styles.statusText}>{callState}</Text>
            <Text style={styles.moqLabel}>MoQ / WebTransport</Text>
          </View>
        ) : (
          <View style={styles.nativeFallback}>
            <Ionicons name="videocam-off" size={48} color="#94a3b8" />
            <Text style={styles.statusText}>
              Voice/video calls require the web build
            </Text>
            <Text style={styles.hint}>
              MoQ uses WebTransport + WebCodecs (browser APIs). Mobile APK supports
              messaging; join calls via web.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color="#fff" />
        </Pressable>

        {isVideo && (
          <Pressable
            style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
            onPress={() => setIsVideoOff(!isVideoOff)}
          >
            <Ionicons
              name={isVideoOff ? "videocam-off" : "videocam"}
              size={24}
              color="#fff"
            />
          </Pressable>
        )}

        <Pressable style={styles.endBtn} onPress={handleEndCall}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "space-between",
  },
  videoArea: { flex: 1, justifyContent: "center", alignItems: "center" },
  remoteVideo: { alignItems: "center", gap: 16 },
  avatarPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },
  nativeFallback: { alignItems: "center", padding: 32, gap: 12 },
  statusText: { color: "#e2e8f0", fontSize: 18, fontWeight: "500" },
  moqLabel: { color: "#64748b", fontSize: 12 },
  hint: { color: "#64748b", textAlign: "center", fontSize: 14, lineHeight: 20 },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingBottom: 48,
    paddingTop: 24,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },
  controlBtnActive: { backgroundColor: "#475569" },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },
});
