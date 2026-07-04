import { forwardRef } from "react";

export type LocalVideoPreviewHandle = {
  getVideoElement: () => HTMLVideoElement | null;
};

type Props = {
  stream: globalThis.MediaStream | null;
  visible?: boolean;
  mirrored?: boolean;
};

export const LocalVideoPreview = forwardRef<LocalVideoPreviewHandle, Props>(
  function LocalVideoPreview(_props, _ref) {
    return null;
  }
);
