import { Platform } from "react-native";

type NavigateRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Blur focused element before route change (avoids web aria-hidden warnings). */
export function blurActiveElement() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export function navigateReplace(router: NavigateRouter, href: string) {
  blurActiveElement();
  router.replace(href);
}

export function navigatePush(router: NavigateRouter, href: string) {
  blurActiveElement();
  router.push(href);
}

export function navigateBack(router: { back: () => void }) {
  blurActiveElement();
  router.back();
}
