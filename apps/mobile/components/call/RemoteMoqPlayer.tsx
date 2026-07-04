import type { MultiBackend } from "@moq/watch";

type Props = {
  backend: MultiBackend | null;
  visible?: boolean;
};

/** Native stub — MoQ playback is web-only. */
export function RemoteMoqPlayer(_props: Props) {
  return null;
}
