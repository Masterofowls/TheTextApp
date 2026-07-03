import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { authClient, signUpWithUsername } from "@/lib/auth-client";
import { isValidUsername } from "@/lib/auth-username";
import {
  copyPasswordSecurely,
  generateSecurePassword,
  getClipboardClearSeconds,
  getPasswordHints,
} from "@/lib/secure-password";
import { useUsernameAvailability } from "@/lib/use-username-availability";
import { Box } from "@/components/ui/box";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from "@/components/ui/button";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import {
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { Center } from "@/components/ui/center";
import { ScrollView } from "@/components/ui/scroll-view";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AtSignIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from "@/components/ui/icon";

function HintRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <HStack space="sm" className="items-center">
      <CheckIcon
        className={ok ? "text-primary h-4 w-4" : "text-muted-foreground/40 h-4 w-4"}
      />
      <Text size="sm" className={ok ? "text-foreground" : "text-muted-foreground"}>
        {text}
      </Text>
    </HStack>
  );
}

function usernameHelper(status: ReturnType<typeof useUsernameAvailability>["status"]) {
  switch (status) {
    case "checking":
      return { text: "Checking availability…", invalid: false };
    case "available":
      return { text: "Username is available", invalid: false };
    case "taken":
      return { text: "Username is already taken", invalid: true };
    case "invalid":
      return { text: "3–30 chars: letters, numbers, _ or .", invalid: true };
    case "error":
      return { text: "Could not check — try again", invalid: true };
    default:
      return null;
  }
}

export default function SignUpScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const [loading, setLoading] = useState(false);

  const { status: usernameStatus } = useUsernameAvailability(username);
  const passwordHints = getPasswordHints(password);
  const usernameHelp = usernameHelper(usernameStatus);

  const usernameReady =
    isValidUsername(username.trim()) && usernameStatus === "available";

  const canSubmit = usernameReady && passwordHints.isStrong && !loading;

  const strengthVariant =
    passwordHints.label === "strong"
      ? "default"
      : passwordHints.label === "good"
        ? "secondary"
        : passwordHints.label === "fair"
          ? "outline"
          : "destructive";

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
          { text: "Skip", onPress: () => router.replace("/(tabs)") },
          {
            text: "Register Passkey",
            onPress: async () => {
              try {
                await authClient.passkey.addPasskey({ name: `TheTextApp-${trimmed}` });
              } catch {
                /* optional */
              }
              router.replace("/(tabs)");
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

  return (
    <Box className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Center>
            <Card className="w-full max-w-md">
              <VStack space="lg">
                <VStack space="xs" className="items-center">
                  <Heading size="xl" bold className="text-foreground">
                    Create account
                  </Heading>
                  <Text size="sm" className="text-muted-foreground text-center">
                    Username and password — no email required
                  </Text>
                </VStack>

                <FormControl isInvalid={!!usernameHelp?.invalid}>
                  <FormControlLabel>
                    <FormControlLabelText>Username</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <InputSlot>
                      <InputIcon as={AtSignIcon} className="text-muted-foreground" />
                    </InputSlot>
                    <InputField
                      placeholder="Choose a username"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={username}
                      onChangeText={setUsername}
                    />
                    {usernameStatus === "checking" ? (
                      <InputSlot>
                        <Spinner size="small" className="text-muted-foreground" />
                      </InputSlot>
                    ) : null}
                  </Input>
                  {usernameHelp ? (
                    usernameHelp.invalid ? (
                      <FormControlError>
                        <FormControlErrorText>{usernameHelp.text}</FormControlErrorText>
                      </FormControlError>
                    ) : (
                      <FormControlHelper>
                        <FormControlHelperText className="text-primary">
                          {usernameHelp.text}
                        </FormControlHelperText>
                      </FormControlHelper>
                    )
                  ) : null}
                </FormControl>

                <FormControl>
                  <FormControlLabel>
                    <FormControlLabelText>Password</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <InputSlot>
                      <InputIcon as={LockIcon} className="text-muted-foreground" />
                    </InputSlot>
                    <InputField
                      placeholder="Create a password"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <InputSlot onPress={() => setShowPassword((v) => !v)}>
                      <InputIcon
                        as={showPassword ? EyeOffIcon : EyeIcon}
                        className="text-muted-foreground"
                      />
                    </InputSlot>
                  </Input>
                  <Button variant="link" size="sm" onPress={handleGeneratePassword}>
                    <ButtonIcon as={CopyIcon} />
                    <ButtonText>Generate secure password</ButtonText>
                  </Button>
                  {copiedHint ? (
                    <FormControlHelper>
                      <FormControlHelperText className="text-primary">
                        Copied — clipboard clears in {getClipboardClearSeconds()}s
                      </FormControlHelperText>
                    </FormControlHelper>
                  ) : null}
                </FormControl>

                {password.length > 0 ? (
                  <Box className="rounded-lg border border-border bg-muted/30 p-3">
                    <HStack className="items-center justify-between mb-2">
                      <Text size="sm" bold className="text-foreground">
                        Password strength
                      </Text>
                      <Badge variant={strengthVariant}>
                        <BadgeText>{passwordHints.label}</BadgeText>
                      </Badge>
                    </HStack>
                    <VStack space="xs">
                      <HintRow ok={passwordHints.minLength} text="At least 8 characters" />
                      <HintRow ok={passwordHints.hasLower} text="Lowercase letter" />
                      <HintRow ok={passwordHints.hasUpper} text="Uppercase letter" />
                      <HintRow ok={passwordHints.hasDigit} text="Number" />
                      <HintRow ok={passwordHints.hasSymbol} text="Symbol (!@#$…)" />
                    </VStack>
                  </Box>
                ) : (
                  <Text size="sm" className="text-muted-foreground">
                    Use a strong password or generate one — copied passwords auto-clear
                    from clipboard after {getClipboardClearSeconds()} seconds.
                  </Text>
                )}

                <VStack space="sm">
                  <Button size="lg" onPress={handleSignUp} disabled={!canSubmit}>
                    {loading ? <ButtonSpinner /> : <ButtonText>Sign Up</ButtonText>}
                  </Button>

                  <Button
                    variant="link"
                    size="sm"
                    onPress={() => router.push("/(auth)/sign-in")}
                  >
                    <ButtonText>Already have an account?</ButtonText>
                  </Button>
                </VStack>
              </VStack>
            </Card>
          </Center>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}
