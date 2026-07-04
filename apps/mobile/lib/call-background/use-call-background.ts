/** Native stub — background PiP is web-only. */
export function useCallBackground(_options: {
  active: boolean;
  isVideo: boolean;
  title?: string;
  mediaStream?: MediaStream | null;
  getVideoElement: () => HTMLVideoElement | null;
  onEndCall: () => void;
}) {}

export async function toggleCallPictureInPicture(_video: HTMLVideoElement | null): Promise<boolean> {
  return false;
}

export function isPictureInPictureActive(_video: HTMLVideoElement | null): boolean {
  return false;
}
