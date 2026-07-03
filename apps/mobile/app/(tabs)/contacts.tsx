import { useState } from "react";
import { FlatList } from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { formatUserHandle } from "@/lib/auth-username";
import { Box } from "@/components/ui/box";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Center } from "@/components/ui/center";
import { Spinner } from "@/components/ui/spinner";
import { Divider } from "@/components/ui/divider";
import { SearchIcon } from "@/components/ui/icon";

export default function ContactsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const createDirect = trpc.conversation.createDirect.useMutation({
    onSuccess: (conv) => router.push(`/chat/${conv.id}`),
  });

  const { data: results, isFetching } = trpc.user.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  return (
    <Box className="flex-1 bg-background">
      <Box className="p-4">
        <Input>
          <InputSlot>
            <InputIcon as={SearchIcon} className="text-muted-foreground" />
          </InputSlot>
          <InputField
            placeholder="Search by name or username..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </Input>
      </Box>

      {isFetching ? (
        <Center className="py-4">
          <Spinner className="text-primary" />
        </Center>
      ) : null}

      <FlatList
        data={results ?? []}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <Divider className="bg-border" />}
        ListEmptyComponent={
          <Center className="px-6 py-12">
            <Text size="sm" className="text-muted-foreground text-center">
              {query.length >= 2 && !isFetching
                ? "No users found"
                : "Type at least 2 characters to search"}
            </Text>
          </Center>
        }
        renderItem={({ item }) => (
          <Pressable
            className="px-4 py-3 bg-card"
            onPress={() => createDirect.mutate({ userId: item.id })}
            disabled={createDirect.isPending}
          >
            <HStack space="md" className="items-center">
              <Center className="h-11 w-11 rounded-full bg-primary">
                <Text bold className="text-primary-foreground">
                  {(item.displayName ?? item.name)[0]?.toUpperCase()}
                </Text>
              </Center>
              <VStack space="xs">
                <Text bold className="text-foreground">
                  {item.displayName ?? item.name}
                </Text>
                {formatUserHandle(item) ? (
                  <Text size="sm" className="text-muted-foreground">
                    {formatUserHandle(item)}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          </Pressable>
        )}
      />
    </Box>
  );
}
