import "react-native-gesture-handler";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useSession } from "@/lib/auth-client";
import { TrpcProvider } from "@/lib/providers";
import { RealtimeBridge } from "@/components/RealtimeBridge";
import { WebNotificationPrompt } from "@/components/WebNotificationSetup";
import { useColorScheme } from "@/components/useColorScheme";
import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import { Center } from "@/components/ui/center";
import { Spinner } from "@/components/ui/spinner";
import "@/global.css";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;

    const inAuth = segments[0] === "(auth)";

    if (!session && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuth) {
      router.replace("/(tabs)");
    }
  }, [session, isPending, segments, router]);

  if (isPending) {
    return (
      <Center className="flex-1 bg-background">
        <Spinner size="large" className="text-primary" />
      </Center>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();
  const mode = colorScheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GluestackUIProvider mode={mode}>
      <TrpcProvider>
        <AuthGate>
          <RealtimeBridge />
          <WebNotificationPrompt />
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="chat/[id]"
              options={{ headerShown: true, title: "Chat" }}
            />
            <Stack.Screen
              name="call/[id]"
              options={{ presentation: "fullScreenModal", headerShown: false }}
            />
            <Stack.Screen name="new-chat" options={{ presentation: "modal" }} />
          </Stack>
        </AuthGate>
      </TrpcProvider>
    </GluestackUIProvider>
  );
}
