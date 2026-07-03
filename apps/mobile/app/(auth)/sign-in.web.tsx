import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { signIn, signInWithUsername } from "@/lib/auth-client";
import { navigatePush, navigateReplace } from "@/lib/navigation";

export default function SignInScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passkeySupported =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  async function handleSignIn() {
    if (!username.trim() || !password) {
      Alert.alert("Error", "Please enter username and password");
      return;
    }

    setLoading(true);
    try {
      const result = await signInWithUsername(username, password);
      if (result.error) {
        Alert.alert("Sign in failed", result.error.message ?? "Unknown error");
        return;
      }
      navigateReplace(router, "/(tabs)");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskey() {
    setLoading(true);
    try {
      const result = await signIn.passkey();
      if (result.error) {
        Alert.alert("Passkey failed", result.error.message ?? "No passkey found");
        return;
      }
      navigateReplace(router, "/(tabs)");
    } catch {
      Alert.alert("Passkey unavailable", "Passkeys work on web and supported devices.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-background justify-center px-6 py-8">
      <View className="w-full max-w-md self-center rounded-xl border border-border bg-card p-6 gap-6 shadow-sm">
        <View className="items-center gap-1">
          <Text className="text-2xl font-bold text-foreground">TheTextApp</Text>
          <Text className="text-sm text-muted-foreground text-center">
            Secure messaging & MoQ calls
          </Text>
        </View>

        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-foreground">Username</Text>
            <TextInput
              className="rounded-md border border-border bg-background px-3 py-2.5 text-foreground"
              placeholder="Your username"
              placeholderTextColor="#737373"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium text-foreground">Password</Text>
            <TextInput
              className="rounded-md border border-border bg-background px-3 py-2.5 text-foreground"
              placeholder="Your password"
              placeholderTextColor="#737373"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            className={`rounded-md bg-primary py-3 items-center ${loading ? "opacity-50" : ""}`}
            onPress={handleSignIn}
            disabled={loading}
          >
            <Text className="text-primary-foreground font-semibold">
              {loading ? "Signing in…" : "Sign In"}
            </Text>
          </Pressable>

          {passkeySupported ? (
            <Pressable
              className={`rounded-md border border-border py-3 items-center ${loading ? "opacity-50" : ""}`}
              onPress={handlePasskey}
              disabled={loading}
            >
              <Text className="text-foreground font-medium">Sign in with Passkey</Text>
              <Text className="text-xs text-muted-foreground mt-1">
                Only works if you registered one on this device
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            className="py-2 items-center"
            onPress={() => navigatePush(router, "/(auth)/sign-up")}
          >
            <Text className="text-primary font-medium">Create an account</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
