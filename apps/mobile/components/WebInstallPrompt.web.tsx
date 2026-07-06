import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable } from "react-native";
import { ANDROID_APK_RELEASES_URL } from "@/lib/release-links";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function WebInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const installPwa = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallEvent(null);
  }, [installEvent]);

  const downloadApk = useCallback(() => {
    void Linking.openURL(ANDROID_APK_RELEASES_URL);
  }, []);

  if (installed) return null;

  return (
    <Box className="rounded-xl border border-border bg-muted/20 p-4 mt-4">
      <Text bold className="text-foreground">
        Install TheTextApp
      </Text>
      <Text size="sm" className="text-muted-foreground mt-1">
        Add to your home screen like the Android APK, or download the native Android build.
      </Text>
      <HStack space="sm" className="mt-3">
        {installEvent ? (
          <Button size="sm" onPress={installPwa} className="flex-1">
            <ButtonText>Install web app</ButtonText>
          </Button>
        ) : null}
        <Pressable
          onPress={downloadApk}
          className={`flex-1 items-center justify-center rounded-md border border-border py-2 ${installEvent ? "" : "w-full"}`}
        >
          <Text size="sm" className="text-primary font-medium">
            Download Android APK
          </Text>
        </Pressable>
      </HStack>
    </Box>
  );
}
