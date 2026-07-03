import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { formatUserHandle } from "@/lib/auth-username";
import {
  getWebNotificationPermission,
  getWebNotificationPrefs,
  requestWebNotificationPermission,
  setWebNotificationPrefs,
  showWebTestNotification,
  type WebNotificationPrefs,
} from "@/lib/web-notifications";
import { trpc } from "@/lib/trpc";
import { useE2E } from "@/lib/use-e2e";
import { useWebNotificationNavigation } from "@/hooks/use-web-notifications";
import { Box } from "@/components/ui/box";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { Card } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Center } from "@/components/ui/center";
import { Divider } from "@/components/ui/divider";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";

export default function SettingsScreen() {
  useWebNotificationNavigation();

  const router = useRouter();
  const { data: session } = useSession();
  const { data: me } = trpc.user.me.useQuery();
  const { ready: e2eReady } = useE2E();
  const { data: identityKey } = trpc.crypto.getMyIdentityKey.useQuery();

  const [notifPermission, setNotifPermission] = useState(getWebNotificationPermission());
  const [notifPrefs, setNotifPrefs] = useState<WebNotificationPrefs>(getWebNotificationPrefs());

  useEffect(() => {
    setNotifPermission(getWebNotificationPermission());
    setNotifPrefs(getWebNotificationPrefs());
  }, []);

  const displayName = me?.name ?? session?.user?.name ?? "?";
  const handle = formatUserHandle(me ?? session?.user ?? {});
  const e2eActive = e2eReady && !!identityKey;

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  async function handleRegisterPasskey() {
    try {
      const result = await authClient.passkey.addPasskey({
        name: `TheTextApp-${me?.name ?? "device"}`,
      });
      if (result.error) {
        Alert.alert("Failed", result.error.message ?? "Could not register passkey");
      } else {
        Alert.alert("Success", "Passkey registered on this device!");
      }
    } catch (err) {
      Alert.alert(
        "Passkey Error",
        err instanceof Error ? err.message : "Passkey registration failed"
      );
    }
  }

  const requestNotifications = useCallback(async () => {
    const result = await requestWebNotificationPermission();
    setNotifPermission(result);
    if (result === "granted") {
      await showWebTestNotification();
    }
  }, []);

  const updatePref = useCallback((partial: Partial<WebNotificationPrefs>) => {
    setWebNotificationPrefs(partial);
    setNotifPrefs(getWebNotificationPrefs());
  }, []);

  const permissionLabel =
    notifPermission === "granted"
      ? "Enabled"
      : notifPermission === "denied"
        ? "Blocked"
        : notifPermission === "unsupported"
          ? "Unsupported"
          : "Not enabled";

  return (
    <Box className="flex-1 bg-background p-4">
      <Card className="items-center mb-6">
        <Center className="h-20 w-20 rounded-full bg-primary mb-3">
          <Text bold className="text-primary-foreground text-3xl">
            {displayName[0]?.toUpperCase()}
          </Text>
        </Center>
        <Heading size="lg" className="text-foreground">
          {displayName}
        </Heading>
        {handle ? (
          <Text size="sm" className="text-muted-foreground mt-1">
            {handle}
          </Text>
        ) : null}
      </Card>

      <Card className="p-0 overflow-hidden mb-4">
        <Text
          size="xs"
          bold
          className="text-muted-foreground uppercase px-4 pt-4 pb-2"
        >
          Desktop notifications
        </Text>

        <Box className="px-4 py-4">
          <VStack space="xs">
            <Text className="text-foreground">System notifications</Text>
            <Box className="flex-row items-center gap-2 mt-1">
              <Badge
                variant={notifPermission === "granted" ? "default" : "outline"}
              >
                <BadgeText>{permissionLabel}</BadgeText>
              </Badge>
              <Text size="sm" className="text-muted-foreground flex-1">
                {notifPermission === "granted"
                  ? "Messages and calls appear in your OS notification center"
                  : notifPermission === "denied"
                    ? "Unblock in browser site settings, then refresh"
                    : "Chrome, Edge, Firefox, and Safari on desktop"}
              </Text>
            </Box>
          </VStack>

          {notifPermission !== "granted" && notifPermission !== "unsupported" ? (
            <Button size="sm" className="mt-3" onPress={requestNotifications}>
              <ButtonText>Enable notifications</ButtonText>
            </Button>
          ) : null}

          {notifPermission === "granted" ? (
            <VStack space="sm" className="mt-4">
              <PrefToggle
                label="Message previews"
                value={notifPrefs.messages}
                onChange={(messages) => updatePref({ messages })}
              />
              <PrefToggle
                label="Incoming calls"
                value={notifPrefs.calls}
                onChange={(calls) => updatePref({ calls })}
              />
              <PrefToggle
                label="Notification sound"
                value={notifPrefs.sound}
                onChange={(sound) => updatePref({ sound })}
              />
              <Button
                size="sm"
                variant="outline"
                onPress={() => showWebTestNotification()}
              >
                <ButtonText>Send test notification</ButtonText>
              </Button>
            </VStack>
          ) : null}
        </Box>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Text
          size="xs"
          bold
          className="text-muted-foreground uppercase px-4 pt-4 pb-2"
        >
          Security
        </Text>

        <Pressable className="px-4 py-4" onPress={handleRegisterPasskey}>
          <Text className="text-foreground">Register Passkey</Text>
          <Text size="sm" className="text-muted-foreground mt-1">
            Face ID, fingerprint, or security key
          </Text>
        </Pressable>

        <Divider className="bg-border" />

        <Box className="px-4 py-4">
          <VStack space="xs">
            <Text className="text-foreground">E2E Encryption</Text>
            <HStackRow active={e2eActive} />
          </VStack>
        </Box>

        <Divider className="bg-border" />

        <Pressable className="px-4 py-4" onPress={handleSignOut}>
          <Text className="text-destructive">Sign Out</Text>
        </Pressable>
      </Card>

      <VStack space="xs" className="mt-auto items-center py-6">
        <Text size="sm" className="text-muted-foreground">
          TheTextApp v1.0
        </Text>
        <Text size="xs" className="text-muted-foreground text-center">
          E2E encrypted messages · MoQ calls · Passkeys on all platforms
        </Text>
      </VStack>
    </Box>
  );
}

function PrefToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      className="flex-row items-center justify-between py-2"
      onPress={() => onChange(!value)}
    >
      <Text className="text-foreground">{label}</Text>
      <Badge variant={value ? "default" : "outline"}>
        <BadgeText>{value ? "On" : "Off"}</BadgeText>
      </Badge>
    </Pressable>
  );
}

function HStackRow({ active }: { active: boolean }) {
  return (
    <Box className="flex-row items-center gap-2 mt-1">
      <Badge variant={active ? "default" : "outline"}>
        <BadgeText>{active ? "Active" : "Initializing"}</BadgeText>
      </Badge>
      <Text size="sm" className="text-muted-foreground">
        {active ? "Keys stored on this device" : "Setting up encryption…"}
      </Text>
    </Box>
  );
}
