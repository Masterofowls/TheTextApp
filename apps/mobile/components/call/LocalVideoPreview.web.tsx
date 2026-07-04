import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

export type LocalVideoPreviewHandle = {
  getVideoElement: () => HTMLVideoElement | null;
};

type Props = {
  stream: MediaStream | null;
  visible?: boolean;
  mirrored?: boolean;
};

const PIP_STYLE: CSSProperties = {
  position: "absolute",
  right: 16,
  bottom: 16,
  width: 120,
  height: 160,
  borderRadius: 12,
  overflow: "hidden",
  border: "2px solid rgba(255,255,255,0.25)",
  backgroundColor: "#1e293b",
  zIndex: 10,
};

/** RN Web cannot bind MediaStream via JSX `<video srcObject>` — attach imperatively. */
export const LocalVideoPreview = forwardRef<LocalVideoPreviewHandle, Props>(
  function LocalVideoPreview({ stream, visible = true, mirrored = true }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useImperativeHandle(ref, () => ({
      getVideoElement: () => videoRef.current,
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let video = videoRef.current;
      if (!video) {
        video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        video.style.backgroundColor = "#1e293b";
        container.appendChild(video);
        videoRef.current = video;
      }

      video.style.transform = mirrored ? "scaleX(-1)" : "";

      const hasVideo = !!stream?.getVideoTracks().length;
      if (visible && hasVideo && stream) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        void video.play().catch(() => {});
      } else {
        video.srcObject = null;
      }
    }, [stream, visible, mirrored]);

    if (!visible || !stream?.getVideoTracks().length) return null;

    return createElement("div", {
      ref: containerRef,
      style: PIP_STYLE,
      "aria-label": "Your camera preview",
    });
  }
);
