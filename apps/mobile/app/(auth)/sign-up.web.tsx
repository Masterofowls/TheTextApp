import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { authClient, signUpWithUsername } from "@/lib/auth-client";
import { navigatePush, navigateReplace } from "@/lib/navigation";
import { isValidUsername } from "@/lib/auth-username";
import {
  copyPasswordSecurely,
  generateSecurePassword,
  getClipboardClearSeconds,
  getPasswordHints,
} from "@/lib/secure-password";
import { useUsernameAvailability } from "@/lib/use-username-availability";

function HintRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className={ok ? "text-primary text-sm" : "text-muted-foreground/50 text-sm"}>
        {ok ? "✓" : "○"}
      </Text>
      <Text className={`text-sm ${ok ? "text-foreground" : "text-muted-foreground"}`}>
        {text}
      </Text>
    </View>
  );
}

function usernameMessage(status: ReturnType<typeof useUsernameAvailability>["status"]) {
  switch (status) {
    case "checking":
      return { text: "Checking availability…", tone: "muted" as const };
    case "available":
      return { text: "Username is available", tone: "ok" as const };
    case "taken":
      return { text: "Username is already taken", tone: "error" as const };
    case "invalid":
      return { text: "3–30 chars: letters, numbers, _ or .", tone: "warn" as const };
    case "error":
      return { text: "Could not check — try again", tone: "error" as const };
    default:
      return null;
  }
}

const toneClass = {
  muted: "text-muted-foreground",
  ok: "text-primary",
  warn: "text-destructive",
  error: "text-destructive",
};

export default function SignUpScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const [loading, setLoading] = useState(false);

  const { status: usernameStatus } = useUsernameAvailability(username);
  const passwordHints = getPasswordHints(password);
  const usernameHelp = usernameMessage(usernameStatus);

  const usernameReady =
    isValidUsername(username.trim()) && usernameStatus === "available";

  const canSubmit = usernameReady && passwordHints.isStrong && !loading;

  async function handleGeneratePassword() {
    const generated = generateSecurePassword(16);
    setPassword(generated);
    setShowPassword(true);

    try {
      await copyPasswordSecurely(generated);
      setCopiedHint(true);
      setTimeout(() => setCopiedHint(false), 4000);
    } catch {
      Alert.alert(
        "Password generated",
        "Save it somewhere safe — clipboard copy failed on this device."
      );
    }
  }

  async function handleSignUp() {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      Alert.alert("Error", "Please enter a username and password");
      return;
    }

    if (!isValidUsername(trimmed)) {
      Alert.alert(
        "Invalid username",
        "Use 3–30 characters: letters, numbers, underscores, or periods."
      );
      return;
    }

    if (usernameStatus === "taken") {
      Alert.alert("Username taken", "Pick a different username.");
      return;
    }

    if (!passwordHints.isStrong) {
      Alert.alert("Weak password", "Meet all password requirements below.");
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithUsername(trimmed, password);
      if (result.error) {
        Alert.alert("Sign up failed", result.error.message ?? "Unknown error");
        return;
      }

      Alert.alert(
        "Add a Passkey?",
        "Register a passkey for faster, more secure sign-in on this device.",
        [
          {
            text: "Skip",
            onPress: () => navigateReplace(router, "/(tabs)"),
          },
          {
            text: "Register Passkey",
            onPress: async () => {
              try {
                await authClient.passkey.addPasskey({ name: `TheTextApp-${trimmed}` });
              } catch {
                /* optional */
              }
              navigateReplace(router, "/(tabs)");
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  const inputBorder =
    usernameHelp?.tone === "ok"
      ? "border-primary"
      : usernameHelp?.tone === "error" || usernameHelp?.tone === "warn"
        ? "border-destructive"
        : "border-border";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md self-center rounded-xl border border-border bg-card p-6 gap-6 shadow-sm">
        <View className="items-center gap-1">
          <Text className="text-xl font-bold text-foreground">Create account</Text>
          <Text className="text-sm text-muted-foreground text-center">
            Username and password — no email required
          </Text>
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-foreground">Username</Text>
          <TextInput
            className={`rounded-md border bg-background px-3 py-2.5 text-foreground ${inputBorder}`}
            placeholder="Choose a username"
            placeholderTextColor="#737373"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          {usernameHelp ? (
            <Text className={`text-xs mt-1 ${toneClass[usernameHelp.tone]}`}>
              {usernameHelp.text}
            </Text>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-foreground">Password</Text>
          <View className="flex-row items-center rounded-md border border-border bg-background">
            <TextInput
              className="flex-1 px-3 py-2.5 text-foreground"
              placeholder="Create a password"
              placeholderTextColor="#737373"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable className="px-3 py-2.5" onPress={() => setShowPassword((v) => !v)}>
              <Text className="text-sm text-muted-foreground">
                {showPassword ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>

          <Pressable className="py-1" onPress={handleGeneratePassword}>
            <Text className="text-sm text-primary font-medium">
              Generate secure password
            </Text>
          </Pressable>

          {copiedHint ? (
            <Text className="text-xs text-primary">
              Copied — clipboard clears in {getClipboardClearSeconds()}s
            </Text>
          ) : null}
        </View>

        {password.length > 0 ? (
          <View className="rounded-lg border border-border bg-muted/30 p-3 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">Password strength</Text>
              <Text className="text-xs font-medium uppercase text-muted-foreground">
                {passwordHints.label}
              </Text>
            </View>
            <HintRow ok={passwordHints.minLength} text="At least 8 characters" />
            <HintRow ok={passwordHints.hasLower} text="Lowercase letter" />
            <HintRow ok={passwordHints.hasUpper} text="Uppercase letter" />
            <HintRow ok={passwordHints.hasDigit} text="Number" />
            <HintRow ok={passwordHints.hasSymbol} text="Symbol (!@#$…)" />
          </View>
        ) : (
          <Text className="text-sm text-muted-foreground">
            Use a strong password or generate one — copied passwords auto-clear from
            clipboard after {getClipboardClearSeconds()} seconds.
          </Text>
        )}

        <View className="gap-3">
          <Pressable
            className={`rounded-md bg-primary py-3 items-center ${!canSubmit ? "opacity-40" : ""}`}
            onPress={handleSignUp}
            disabled={!canSubmit}
          >
            <Text className="text-primary-foreground font-semibold">
              {loading ? "Creating account…" : "Sign Up"}
            </Text>
          </Pressable>

          <Pressable
            className="py-2 items-center"
            onPress={() => navigatePush(router, "/(auth)/sign-in")}
          >
            <Text className="text-primary font-medium">Already have an account?</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
