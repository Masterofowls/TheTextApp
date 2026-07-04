import { useCallback, useEffect, useRef, useState } from "react";
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
import { MoqCallClient, isRelayReachableError, moqWebTransportUrl, probeRelayReachable, relaySetupHint } from "@thetextapp/moq";
import { LocalVideoPreview, type LocalVideoPreviewHandle } from "@/components/call/LocalVideoPreview";
import { RemoteMoqPlayer } from "@/components/call/RemoteMoqPlayer";
import {
  toggleCallPictureInPicture,
  useCallBackground,
} from "@/lib/call-background/use-call-background";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { blurActiveElement, navigateBack } from "@/lib/navigation";
import { subscribeCallAnswered, subscribeCallEnded } from "@/lib/incoming-call-store";
import { API_URL } from "@/lib/config";

export default function CallScreen() {
  const { id: callId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const moqRef = useRef<MoqCallClient | null>(null);
  const connectStartedRef = useRef<string | null>(null);
  const previewRef = useRef<LocalVideoPreviewHandle>(null);
  const getPreviewVideo = useCallback(
    () => previewRef.current?.getVideoElement() ?? null,
    []
  );
  const [callState, setCallState] = useState<string>("connecting");
  const [relayDown, setRelayDown] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [peerJoined, setPeerJoined] = useState(false);
  const [watchBackend, setWatchBackend] = useState<
    import("@moq/watch").MultiBackend | null
  >(null);
  const pulse = useSharedValue(1);

  const { data: moqConfig, isLoading } = trpc.calls.getMoqToken.useQuery(
    { callId: callId! },
    {
      enabled: !!callId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    }
  );

  const answerCall = trpc.calls.answer.useMutation();
  const endCall = trpc.calls.end.useMutation({
    onSuccess: () => navigateBack(router),
  });

  useEffect(() => {
    blurActiveElement();
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 1000 }), -1, true);
  }, [pulse]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    moqRef.current?.setMuted(isMuted);
  }, [isMuted, localStream]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
  }, [isVideoOff, localStream]);

  const isConnected =
    callState === "connected" ||
    callState === "publishing" ||
    callState === "reconnecting";

  const isVideo = moqConfig?.call.type === "video";

  const handleEndCall = useCallback(async () => {
    setWatchBackend(null);
    await moqRef.current?.end();
    endCall.mutate({ callId: callId! });
  }, [callId, endCall]);

  useCallBackground({
    active: isConnected && Platform.OS === "web",
    isVideo: !!isVideo && !isVideoOff,
    title: "TheTextApp call",
    mediaStream: localStream,
    getVideoElement: getPreviewVideo,
    onEndCall: handleEndCall,
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const syncPiP = () => {
      setPipActive(document.pictureInPictureElement === getPreviewVideo());
    };
    document.addEventListener("enterpictureinpicture", syncPiP);
    document.addEventListener("leavepictureinpicture", syncPiP);
    return () => {
      document.removeEventListener("enterpictureinpicture", syncPiP);
      document.removeEventListener("leavepictureinpicture", syncPiP);
    };
  }, [getPreviewVideo]);

  useEffect(() => {
    if (!callId) return;
    const unsubAnswered = subscribeCallAnswered((event) => {
      if (event.callId === callId) setPeerJoined(true);
    });
    const unsubEnded = subscribeCallEnded((event) => {
      if (event.callId !== callId) return;
      void (async () => {
        setWatchBackend(null);
        await moqRef.current?.end();
        navigateBack(router);
      })();
    });
    return () => {
      unsubAnswered();
      unsubEnded();
    };
  }, [callId, router]);

  function formatCallStatus(state: string): string {
    const isInitiator = moqConfig?.call.initiatorId === session?.user?.id;
    if (isInitiator && !peerJoined && (state === "connected" || state === "publishing")) {
      return "Ringing… waiting for them to answer";
    }
    if (state === "publishing") return "Connected · publishing via WebTransport";
    if (state === "connected") return "Connected via WebTransport";
    if (state === "reconnecting") return "Reconnecting…";
    return state;
  }

  useEffect(() => {
    if (!moqConfig || Platform.OS !== "web" || !callId || !session?.user?.id) return;
    if (!moqConfig.peerUserId) return;
    if (connectStartedRef.current === callId) return;
    connectStartedRef.current = callId;

    const configSnapshot = {
      relayUrl: moqWebTransportUrl(moqConfig.relayUrl),
      apiBaseUrl: API_URL,
      broadcastName: moqConfig.broadcastName,
      token: moqConfig.token,
      userId: session.user.id,
      peerUserId: moqConfig.peerUserId,
      audio: true as const,
      video: moqConfig.call.type === "video",
    };
    const isInitiator = moqConfig.call.initiatorId === session.user.id;

    let cancelled = false;
    const client = new MoqCallClient({
      onStateChange: setCallState,
      onLocalStream: setLocalStream,
      onError: (err) => {
        if (!relayDown && !cancelled) {
          Alert.alert("Call error", err.message);
        }
      },
    });
    moqRef.current = client;

    async function connect() {
      try {
        const relayOk = await probeRelayReachable(moqConfig!.relayUrl, API_URL);
        if (cancelled) return;
        if (!relayOk) {
          setRelayDown(true);
          setCallState("relay_unavailable");
          return;
        }

        if (!isInitiator) {
          await answerCall.mutateAsync({ callId: callId! });
        }
        if (cancelled) return;

        await client.join(configSnapshot);
        if (cancelled) return;
        setWatchBackend(client.getWatchBackend());
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? isRelayReachableError(err)
              ? `${err.message}\n\n${relaySetupHint(moqConfig!.relayUrl)}`
              : err.message
            : "MoQ connection failed";
        console.warn("[call] MoQ connection failed:", err);
        if (!relayDown) {
          Alert.alert("Call connection failed", message);
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (connectStartedRef.current === callId) {
        connectStartedRef.current = null;
      }
      setWatchBackend(null);
      setLocalStream(null);
      void client.end();
    };
    // Intentionally omit moqConfig object — refetch would tear down WebTransport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, session?.user?.id, moqConfig?.broadcastName, moqConfig?.peerUserId]);

  async function handleToggleScreenShare() {
    const client = moqRef.current;
    if (!client) return;
    try {
      if (client.isScreenSharing()) {
        await client.stopScreenShare();
        setIsScreenSharing(false);
        setIsVideoOff(false);
      } else {
        await client.startScreenShare();
        setIsScreenSharing(true);
        setIsVideoOff(false);
      }
    } catch (err) {
      Alert.alert(
        "Screen share failed",
        err instanceof Error ? err.message : "Could not share screen"
      );
    }
  }

  async function handleTogglePiP() {
    const active = await toggleCallPictureInPicture(getPreviewVideo());
    setPipActive(active);
  }

  if (isLoading || !moqConfig) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.statusText}>Connecting call...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoArea}>
        {Platform.OS === "web" ? (
          <>
            <View style={styles.remoteVideo}>
              {Platform.OS === "web" && isConnected ? (
                <RemoteMoqPlayer backend={watchBackend} visible={!!isVideo} />
              ) : null}
              {!isConnected && (
                <Animated.View style={[styles.avatarPulse, pulseStyle]}>
                  <Ionicons name="person" size={64} color="#94a3b8" />
                </Animated.View>
              )}
              <Text style={styles.statusText}>
                {relayDown ? "MoQ relay offline" : formatCallStatus(callState)}
              </Text>
              {relayDown ? (
                <Text style={styles.hint}>{relaySetupHint(moqConfig.relayUrl)}</Text>
              ) : (
                <Text style={styles.moqLabel}>MoQ / WebTransport</Text>
              )}
            </View>
            <LocalVideoPreview
              ref={previewRef}
              stream={localStream}
              visible={
                isConnected &&
                !isVideoOff &&
                (isVideo || isScreenSharing || !!localStream?.getVideoTracks().length)
              }
            />
          </>
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

        {Platform.OS === "web" && isConnected && (
          <Pressable
            style={[styles.controlBtn, isScreenSharing && styles.controlBtnActive]}
            onPress={() => void handleToggleScreenShare()}
            accessibilityLabel={isScreenSharing ? "Stop screen share" : "Share screen"}
          >
            <Ionicons
              name={isScreenSharing ? "stop-circle" : "desktop-outline"}
              size={24}
              color="#fff"
            />
          </Pressable>
        )}

        {isVideo && (
          <>
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
            {Platform.OS === "web" && isConnected && !isVideoOff && (
              <Pressable
                style={[styles.controlBtn, pipActive && styles.controlBtnActive]}
                onPress={() => void handleTogglePiP()}
                accessibilityLabel="Picture in picture"
              >
                <Ionicons
                  name={pipActive ? "contract" : "expand"}
                  size={24}
                  color="#fff"
                />
              </Pressable>
            )}
          </>
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
  videoArea: { flex: 1, justifyContent: "center", alignItems: "center", position: "relative" },
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
