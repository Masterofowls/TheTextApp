import { useEffect, useRef } from "react";

/** Chrome supports `hangup` before it appears in all TypeScript DOM libs. */
const MEDIA_SESSION_HANGUP = "hangup" as MediaSessionAction;

type Options = {
  active: boolean;
  isVideo: boolean;
  title?: string;
  /** Call audio stream — keeps tab from being fully suspended in background. */
  mediaStream?: MediaStream | null;
  getVideoElement: () => HTMLVideoElement | null;
  onEndCall: () => void;
};

function supportsPiP(): boolean {
  return (
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled
  );
}

/** Keep call alive in background tabs: PiP popup, media session, wake lock, unload guard. */
export function useCallBackground({
  active,
  isVideo,
  title = "TheTextApp call",
  mediaStream,
  getVideoElement,
  onEndCall,
}: Options) {
  const onEndCallRef = useRef(onEndCall);
  onEndCallRef.current = onEndCall;

  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const enterPiP = async () => {
      const video = getVideoElement();
      if (!isVideo || !video || !supportsPiP()) return;
      if (document.pictureInPictureElement === video) return;
      try {
        await video.requestPictureInPicture();
      } catch {
        /* PiP may require a recent user gesture in some browsers */
      }
    };

    const exitPiP = async () => {
      const video = getVideoElement();
      if (document.pictureInPictureElement && document.pictureInPictureElement === video) {
        try {
          await document.exitPictureInPicture();
        } catch {
          /* ignore */
        }
      }
    };

    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = () => {
      void navigator.wakeLock
        ?.request("screen")
        .then((lock) => {
          wakeLock = lock;
        })
        .catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void enterPiP();
      } else {
        requestWakeLock();
        void exitPiP();
      }
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: "MoQ call in progress",
      });
      navigator.mediaSession.playbackState = "playing";
      try {
        navigator.mediaSession.setActionHandler(MEDIA_SESSION_HANGUP, () => onEndCallRef.current());
      } catch {
        /* unsupported action */
      }
    }

    requestWakeLock();
    window.addEventListener("beforeunload", onBeforeUnload);

    // Hidden <audio> bound to the mic keeps Chrome from suspending WebTransport.
    const keepAlive = document.createElement("audio");
    keepAlive.setAttribute("playsinline", "");
    keepAlive.muted = true;
    keepAlive.style.display = "none";
    const audioTracks = mediaStream?.getAudioTracks() ?? [];
    if (audioTracks.length) {
      keepAlive.srcObject = new MediaStream(audioTracks);
    } else {
      keepAlive.src =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    }
    document.body.appendChild(keepAlive);
    void keepAlive.play().catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void exitPiP();
      wakeLock?.release().catch(() => {});
      keepAlive.pause();
      keepAlive.srcObject = null;
      keepAlive.remove();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        try {
          navigator.mediaSession.setActionHandler(MEDIA_SESSION_HANGUP, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [active, isVideo, title, getVideoElement, mediaStream]);
}

export async function toggleCallPictureInPicture(
  video: HTMLVideoElement | null
): Promise<boolean> {
  if (!video || !supportsPiP()) return false;
  try {
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
      return false;
    }
    await video.requestPictureInPicture();
    return true;
  } catch {
    return false;
  }
}

export function isPictureInPictureActive(video: HTMLVideoElement | null): boolean {
  return !!video && document.pictureInPictureElement === video;
}
