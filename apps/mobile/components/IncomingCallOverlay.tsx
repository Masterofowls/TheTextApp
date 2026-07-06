import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { usePathname } from "expo-router";
import {
  dismissIncomingCall,
  getIncomingCall,
  subscribeIncomingCall,
} from "@/lib/incoming-call-store";
import { navigatePush } from "@/lib/navigation";
import { trpc } from "@/lib/trpc";
import { dismissCallNotification } from "@/lib/notifications";

export function IncomingCallOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const call = useSyncExternalStore(subscribeIncomingCall, getIncomingCall, () => null);
  const pulse = useSharedValue(1);

  const answerMutation = trpc.calls.answer.useMutation();
  const declineMutation = trpc.calls.decline.useMutation({
    onSuccess: (_, variables) => {
      dismissIncomingCall(variables.callId);
      void dismissCallNotification(variables.callId);
    },
  });

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.12, { duration: 900 }), -1, true);
  }, [pulse]);

  if (!call) return null;

  const onCallScreen = pathname === `/call/${call.callId}`;
  if (onCallScreen) return null;

  const isVideo = call.callType === "video";
  const busy = answerMutation.isPending || declineMutation.isPending;

  async function handleAnswer() {
    try {
      await answerMutation.mutateAsync({ callId: call!.callId });
      dismissIncomingCall(call!.callId);
      void dismissCallNotification(call!.callId);
      navigatePush(router, `/call/${call!.callId}`);
    } catch (err) {
      console.error("[incoming-call] answer failed", err);
    }
  }

  function handleDecline() {
    declineMutation.mutate({ callId: call!.callId });
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, Platform.OS === "web" ? webBackdropOverlay : null]}>
        <View style={styles.card}>
          <Animated.View style={[styles.avatar, pulseStyle]}>
            <Ionicons name="person" size={48} color="#e2e8f0" />
          </Animated.View>
          <Text style={styles.title}>{call.initiatorName}</Text>
          <Text style={styles.subtitle}>
            Incoming {isVideo ? "video" : "voice"} call
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.declineBtn, busy && styles.btnDisabled]}
              onPress={handleDecline}
              disabled={busy}
              accessibilityLabel="Decline call"
            >
              <Ionicons name="close" size={28} color="#fff" />
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>

            <Pressable
              style={[styles.answerBtn, busy && styles.btnDisabled]}
              onPress={() => void handleAnswer()}
              disabled={busy}
              accessibilityLabel="Answer call"
            >
              {answerMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={isVideo ? "videocam" : "call"}
                    size={28}
                    color="#fff"
                  />
                  <Text style={styles.btnLabel}>Answer</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const webBackdropOverlay: ViewStyle | null =
  Platform.OS === "web"
    ? ({
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
      } as unknown as ViewStyle)
    : null;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 32,
    marginTop: 8,
  },
  declineBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  answerBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnLabel: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
