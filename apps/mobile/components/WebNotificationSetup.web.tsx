import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import {
  getWebNotificationPermission,
  hasWebNotificationPermission,
  requestWebNotificationPermission,
} from "@/lib/web-notifications";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";

const DISMISS_KEY = "thetextapp_web_notification_prompt_dismissed";

export function WebNotificationPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const permission = getWebNotificationPermission();
    if (permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  const enable = useCallback(async () => {
    const result = await requestWebNotificationPermission();
    setVisible(false);
    if (result === "denied") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }, []);

  if (!visible || hasWebNotificationPermission()) return null;

  return (
    <Box className="absolute bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-border bg-card p-4 shadow-lg">
      <Text bold className="text-foreground">
        Enable desktop notifications
      </Text>
      <Text size="sm" className="text-muted-foreground mt-1">
        Get message previews and incoming call alerts in your system tray — even when
        the browser tab is in the background.
      </Text>
      <HStack space="sm" className="mt-4">
        <Button size="sm" onPress={enable} className="flex-1">
          <ButtonText>Enable</ButtonText>
        </Button>
        <Pressable onPress={dismiss} className="flex-1 items-center justify-center py-2">
          <Text size="sm" className="text-muted-foreground">
            Not now
          </Text>
        </Pressable>
      </HStack>
    </Box>
  );
}
