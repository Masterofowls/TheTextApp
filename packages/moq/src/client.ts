/**
 * MoQ (Media over QUIC) client for TheTextApp voice/video calls.
 * Uses @moq/net Connection.connect over WebTransport (or WebSocket fallback).
 * @see https://moq.dev/
 */

import { Broadcast, Connection, Path } from "@moq/net";
import { isRelayReachableError, relaySetupHint } from "./relay-url";

export type MoqCallConfig = {
  relayUrl: string;
  broadcastName: string;
  token?: string;
  audio?: boolean;
  video?: boolean;
};

export type MoqCallState = "idle" | "connecting" | "connected" | "publishing" | "error" | "ended";

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

export class MoqCallClient {
  private state: MoqCallState = "idle";
  private localStream: MediaStream | null = null;
  private connection: Awaited<ReturnType<typeof Connection.connect>> | null = null;
  private broadcast: Broadcast | null = null;
  private callbacks: MoqCallCallbacks;

  constructor(callbacks: MoqCallCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getState(): MoqCallState {
    return this.state;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  private setState(state: MoqCallState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  async startPublish(config: MoqCallConfig): Promise<void> {
    if (!isWebPlatform()) {
      throw new Error("MoQ publishing requires web platform (use web build for calls)");
    }

    try {
      this.setState("connecting");

      const audio = config.audio !== false;
      const video = config.video === true;
      this.localStream = await getUserMediaWithFallback(audio, video);
      this.callbacks.onLocalStream?.(this.localStream);

      const relay = buildRelayUrl(config.relayUrl, config.token);
      try {
        this.connection = await Connection.connect(relay);
      } catch (err) {
        const hint =
          config.relayUrl.includes("relay.moq.dev") || isRelayReachableError(err)
            ? ` ${relaySetupHint()}`
            : "";
        throw new Error(
          `MoQ relay unreachable at ${config.relayUrl}.${hint}`,
          { cause: err }
        );
      }
      this.setState("connected");

      this.broadcast = new Broadcast();
      this.connection.publish(Path.from(config.broadcastName), this.broadcast);
      this.setState("publishing");
    } catch (err) {
      this.setState("error");
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async startSubscribe(config: MoqCallConfig): Promise<void> {
    if (!isWebPlatform()) {
      throw new Error("MoQ subscribe requires web platform");
    }

    try {
      this.setState("connecting");

      const relay = buildRelayUrl(config.relayUrl, config.token);
      try {
        this.connection = await Connection.connect(relay);
      } catch (err) {
        const hint =
          config.relayUrl.includes("relay.moq.dev") || isRelayReachableError(err)
            ? ` ${relaySetupHint()}`
            : "";
        throw new Error(
          `MoQ relay unreachable at ${config.relayUrl}.${hint}`,
          { cause: err }
        );
      }
      this.setState("connected");

      const remoteBroadcast = this.connection.consume(Path.from(config.broadcastName));
      void remoteBroadcast.requested().then((request) => {
        if (!request) return;
        const stream = new MediaStream();
        this.callbacks.onRemoteStream?.(stream);
      });

      this.setState("publishing");
    } catch (err) {
      this.setState("error");
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async end(): Promise<void> {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.broadcast?.close();
    this.broadcast = null;
    this.connection?.close();
    this.connection = null;
    this.setState("ended");
  }
}

export { supportsWebTransport, isWebPlatform };
