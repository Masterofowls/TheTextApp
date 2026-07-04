/**
 * MoQ (Media over QUIC) client for TheTextApp voice/video calls.
 * Publishes local media via @moq/publish and plays the remote peer via @moq/watch.
 */

import { Connection, Path } from "@moq/net";
import * as Publish from "@moq/publish";
import * as Watch from "@moq/watch";
import {
  fetchRelayCertHash,
  isRelayReachableError,
  moqWebTransportUrl,
  relaySetupHint,
} from "./relay-url";
import {
  connectFlyWebTransport,
  isFirefoxBrowser,
  isFlyRelayUrl,
  moqConnectOptionsForRelay,
} from "./webtransport-connect";

export type MoqCallConfig = {
  relayUrl: string;
  /** API base URL — used to proxy cert fingerprint for Fly relays (browser blocks HTTP:443). */
  apiBaseUrl?: string;
  /** Base broadcast path, e.g. `call-<uuid>`. Each peer publishes to `<base>/<userId>.hang`. */
  broadcastName: string;
  token?: string;
  userId: string;
  peerUserId: string;
  audio?: boolean;
  video?: boolean;
};

export type MoqCallState =
  | "idle"
  | "connecting"
  | "connected"
  | "publishing"
  | "reconnecting"
  | "error"
  | "ended";

export type MoqCallCallbacks = {
  onStateChange?: (state: MoqCallState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
};

function buildRelayUrl(relayUrl: string, token?: string): URL {
  const url = new URL(relayUrl);
  if (token) url.searchParams.set("token", token);
  return url;
}

function isWebPlatform(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function supportsWebTransport(): boolean {
  return isWebPlatform() && "WebTransport" in window;
}

function isExpectedProbeCloseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "WebTransportError") return true;
  return /session is closed|connection is closed|stream is closed/i.test(err.message);
}

let probeSuppressUntil = 0;

function installProbeNoiseFilter() {
  if (typeof console === "undefined") return;
  const g = globalThis as { __moqProbeFilter?: boolean };
  if (g.__moqProbeFilter) return;
  g.__moqProbeFilter = true;
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (Date.now() < probeSuppressUntil) {
      if (args[0] === "probe stream error" && isExpectedProbeCloseError(args[1])) {
        return;
      }
    }
    origWarn(...args);
  };
}

function suppressMoqProbeNoise(ms = 2_000) {
  installProbeNoiseFilter();
  probeSuppressUntil = Math.max(probeSuppressUntil, Date.now() + ms);
}

/** Per-peer MoQ path with explicit hang catalog format, e.g. `call-<id>/<userId>.hang`. */
function hangPeerPath(base: string, peerId: string) {
  return Path.from(base, `${peerId}.hang`);
}

function safeClose(label: string, close: () => void) {
  try {
    close();
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "InvalidStateError" || err.name === "AbortError")
    ) {
      return;
    }
    if (err instanceof Error && /SourceBuffer|MediaSource|session is closed/i.test(err.message)) {
      return;
    }
    console.warn(`[moq] ${label} cleanup:`, err);
  }
}

async function getUserMediaWithFallback(
  audio: boolean,
  video: boolean
): Promise<MediaStream> {
  const wantVideo = video && audio;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: wantVideo ? { facingMode: "user" } : false,
    });
  } catch (err) {
    if (!wantVideo || !audio) throw err;
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

async function getScreenShareStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor" } as MediaTrackConstraints,
    audio: false,
  });
}

async function buildReloadProps(config: MoqCallConfig) {
  const transportUrl = moqWebTransportUrl(config.relayUrl);
  const relay = buildRelayUrl(transportUrl, config.token);
  const fly = isFlyRelayUrl(transportUrl);

  let certHash: string | null = null;
  if (fly) {
    certHash = await fetchRelayCertHash(config.relayUrl, config.apiBaseUrl);
    if (!certHash) {
      throw new Error("Could not fetch MoQ relay certificate fingerprint");
    }
  }

  const connectProps: Connection.ReloadProps = {
    url: relay,
    enabled: true,
    ...moqConnectOptionsForRelay(transportUrl, certHash),
  };

  if (fly && isFirefoxBrowser() && certHash) {
    connectProps.transport = await connectFlyWebTransport(relay, certHash);
    connectProps.websocket = { enabled: false };
  }

  return connectProps;
}

export class MoqCallClient {
  private state: MoqCallState = "idle";
  private localStream: MediaStream | null = null;
  private reload: Connection.Reload | null = null;
  private publishBroadcast: Publish.Broadcast | null = null;
  private watchBroadcast: Watch.Broadcast | null = null;
  private watchBackend: Watch.MultiBackend | null = null;
  private callbacks: MoqCallCallbacks;
  private ended = false;
  private joinConfig: MoqCallConfig | null = null;
  private cameraVideoTrack: Publish.Video.StreamTrack | null = null;
  private screenStream: MediaStream | null = null;
  private screenSharing = false;

  constructor(callbacks: MoqCallCallbacks = {}) {
    this.callbacks = callbacks;
    installProbeNoiseFilter();
  }

  getState(): MoqCallState {
    return this.state;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getWatchBackend(): Watch.MultiBackend | null {
    return this.watchBackend;
  }

  private setState(state: MoqCallState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /** Attach remote playback to a <video> or <canvas> (web). */
  setRemoteElement(element: HTMLVideoElement | HTMLCanvasElement | undefined) {
    this.watchBackend?.element.set(element);
  }

  setMuted(muted: boolean) {
    this.publishBroadcast?.audio.muted.set(muted);
  }

  isScreenSharing(): boolean {
    return this.screenSharing;
  }

  private updateLocalPreviewStream() {
    if (!this.localStream) return;
    this.callbacks.onLocalStream?.(this.localStream);
  }

  private setPublishVideoTrack(track: Publish.Video.StreamTrack | undefined) {
    if (!this.publishBroadcast || !track) return;
    this.publishBroadcast.video.hd.enabled.set(true);
    this.publishBroadcast.video.source.set(track);
    this.watchBackend?.visible.set("always");
  }

  /** Share screen (replaces camera video on the MoQ broadcast). Web only. */
  async startScreenShare(): Promise<void> {
    if (!this.publishBroadcast || this.ended) {
      throw new Error("Join a call before sharing your screen");
    }
    if (this.screenSharing) return;

    const screen = await getScreenShareStream();
    const track = screen.getVideoTracks()[0] as Publish.Video.StreamTrack | undefined;
    if (!track) {
      screen.getTracks().forEach((t) => t.stop());
      throw new Error("No video track from screen capture");
    }

    track.onended = () => {
      void this.stopScreenShare();
    };

    this.screenStream = screen;
    this.screenSharing = true;

    if (!this.cameraVideoTrack) {
      const cam = this.localStream?.getVideoTracks()[0] as Publish.Video.StreamTrack | undefined;
      if (cam) this.cameraVideoTrack = cam;
    }

    if (this.localStream) {
      for (const vt of [...this.localStream.getVideoTracks()]) {
        if (vt !== track) this.localStream.removeTrack(vt);
      }
      if (!this.localStream.getVideoTracks().includes(track)) {
        this.localStream.addTrack(track);
      }
    } else {
      this.localStream = new MediaStream([track]);
    }

    this.setPublishVideoTrack(track);
    this.updateLocalPreviewStream();
  }

  /** Stop screen share and restore camera if available. */
  async stopScreenShare(): Promise<void> {
    if (!this.screenSharing) return;

    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.screenSharing = false;

    const wantVideo = this.joinConfig?.video === true;
    const cam = this.cameraVideoTrack;

    if (cam && wantVideo && this.localStream) {
      for (const vt of [...this.localStream.getVideoTracks()]) {
        this.localStream.removeTrack(vt);
      }
      this.localStream.addTrack(cam);
      this.setPublishVideoTrack(cam);
    } else if (this.publishBroadcast) {
      this.publishBroadcast.video.hd.enabled.set(false);
      this.publishBroadcast.video.source.set(undefined);
      if (!wantVideo) this.watchBackend?.visible.set("never");
      if (this.localStream) {
        for (const vt of [...this.localStream.getVideoTracks()]) {
          vt.stop();
          this.localStream.removeTrack(vt);
        }
      }
    }

    this.updateLocalPreviewStream();
  }

  /**
   * Join a 1:1 call: publish to `<broadcastName>/<userId>.hang` and watch
   * `<broadcastName>/<peerUserId>.hang`.
   */
  async join(config: MoqCallConfig): Promise<void> {
    if (!isWebPlatform()) {
      throw new Error("MoQ calls require web platform (use web build for calls)");
    }

    this.ended = false;
    this.joinConfig = config;
    this.cameraVideoTrack = null;
    this.screenStream = null;
    this.screenSharing = false;

    try {
      this.setState("connecting");

      const audio = config.audio !== false;
      const video = config.video === true;

      this.localStream = await getUserMediaWithFallback(audio, video);
      this.callbacks.onLocalStream?.(this.localStream);

      const reloadProps = await buildReloadProps(config);
      this.reload = new Connection.Reload(reloadProps);

      const publishPath = hangPeerPath(config.broadcastName, config.userId);
      const subscribePath = hangPeerPath(config.broadcastName, config.peerUserId);

      const audioTrack = this.localStream.getAudioTracks()[0] as
        | Publish.Audio.StreamTrack
        | undefined;
      const videoTrack = this.localStream.getVideoTracks()[0] as
        | Publish.Video.StreamTrack
        | undefined;
      if (videoTrack) this.cameraVideoTrack = videoTrack;
      const publishVideo = video && Boolean(videoTrack);

      this.publishBroadcast = new Publish.Broadcast({
        connection: this.reload.established,
        enabled: true,
        name: publishPath,
        audio: {
          enabled: Boolean(audioTrack),
          source: audioTrack,
        },
        video: publishVideo
          ? {
              hd: { enabled: true },
              source: videoTrack,
            }
          : undefined,
      });

      this.watchBroadcast = new Watch.Broadcast({
        connection: this.reload.established,
        enabled: true,
        name: subscribePath,
        catalogFormat: "hang",
      });

      this.watchBackend = new Watch.MultiBackend({
        broadcast: this.watchBroadcast,
        connection: this.reload.established,
        visible: publishVideo ? "always" : "never",
      });

      this.setState("publishing");
    } catch (err) {
      this.setState("error");
      const error = err instanceof Error ? err : new Error(String(err));
      const transportUrl = moqWebTransportUrl(config.relayUrl);
      if (config.relayUrl.includes("relay.moq.dev") || isRelayReachableError(err)) {
        throw new Error(`MoQ relay unreachable at ${transportUrl}. ${relaySetupHint(config.relayUrl)}`, {
          cause: err,
        });
      }
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /** @deprecated Use {@link join} — both peers publish and subscribe. */
  async startPublish(config: MoqCallConfig): Promise<void> {
    return this.join(config);
  }

  /** @deprecated Use {@link join} — both peers publish and subscribe. */
  async startSubscribe(config: MoqCallConfig): Promise<void> {
    return this.join(config);
  }

  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    suppressMoqProbeNoise();

    try {
      this.watchBackend?.element.set(undefined);
    } catch {
      /* element may already be detached */
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.screenSharing = false;
    this.joinConfig = null;
    this.cameraVideoTrack = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    const publish = this.publishBroadcast;
    const watchBackend = this.watchBackend;
    const watchBroadcast = this.watchBroadcast;
    const reload = this.reload;
    this.publishBroadcast = null;
    this.watchBackend = null;
    this.watchBroadcast = null;
    this.reload = null;

    safeClose("publish", () => publish?.close());
    safeClose("watchBackend", () => watchBackend?.close());
    safeClose("watchBroadcast", () => watchBroadcast?.close());
    safeClose("connection", () => reload?.close());

    this.setState("ended");
  }
}

export { supportsWebTransport, isWebPlatform };
