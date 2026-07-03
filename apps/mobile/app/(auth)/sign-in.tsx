import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { signIn, signInWithUsername } from "@/lib/auth-client";
import { Box } from "@/components/ui/box";
import { VStack } from "@/components/ui/vstack";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Button, ButtonSpinner, ButtonText } from "@/components/ui/button";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { FormControl, FormControlLabel, FormControlLabelText } from "@/components/ui/form-control";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { Center } from "@/components/ui/center";
import { AtSignIcon, LockIcon } from "@/components/ui/icon";

export default function SignInScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
      router.replace("/(tabs)");
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
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Passkey unavailable", "Passkeys work on web and supported devices.");
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
        <Center className="flex-1 px-6">
          <Card className="w-full max-w-md">
            <VStack space="lg">
              <VStack space="xs" className="items-center">
                <Heading size="2xl" bold className="text-foreground">
                  TheTextApp
                </Heading>
                <Text size="sm" className="text-muted-foreground text-center">
                  Secure messaging & MoQ calls
                </Text>
              </VStack>

              <VStack space="md">
                <FormControl>
                  <FormControlLabel>
                    <FormControlLabelText>Username</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <InputSlot>
                      <InputIcon as={AtSignIcon} className="text-muted-foreground" />
                    </InputSlot>
                    <InputField
                      placeholder="Your username"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={username}
                      onChangeText={setUsername}
                    />
                  </Input>
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
                      placeholder="Your password"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                  </Input>
                </FormControl>
              </VStack>

              <VStack space="sm">
                <Button size="lg" onPress={handleSignIn} disabled={loading}>
                  {loading ? <ButtonSpinner /> : <ButtonText>Sign In</ButtonText>}
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onPress={handlePasskey}
                  disabled={loading}
                >
                  <ButtonText>Sign in with Passkey</ButtonText>
                </Button>

                <Button
                  variant="link"
                  size="sm"
                  onPress={() => router.push("/(auth)/sign-up")}
                >
                  <ButtonText>Create an account</ButtonText>
                </Button>
              </VStack>
            </VStack>
          </Card>
        </Center>
      </KeyboardAvoidingView>
    </Box>
  );
}
