import { useEffect, useRef } from "react";
import type { MultiBackend } from "@moq/watch";

type Props = {
  backend: MultiBackend | null;
  visible?: boolean;
};

/**
 * Renders remote MoQ media via @moq/watch MultiBackend (web only).
 * Uses <canvas> so playback goes through WebCodecs — <video> forces MSE and
 * fails on audio-only / legacy catalogs with "Missing required fields…".
 */
export function RemoteMoqPlayer({ backend, visible = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !backend) return;
    backend.element.set(el);
    return () => {
      backend.element.set(undefined);
    };
  }, [backend]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden={!visible}
      style={{
        display: visible ? "block" : "none",
        width: visible ? "100%" : 1,
        height: visible ? 320 : 1,
        maxWidth: visible ? 480 : 1,
        borderRadius: 12,
        backgroundColor: "#1e293b",
      }}
    />
  );
}
