import { useCallback } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import { navigatePush } from "@/lib/navigation";
import { Box } from "@/components/ui/box";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { Button, ButtonIcon, ButtonText } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { Center } from "@/components/ui/center";
import { Spinner } from "@/components/ui/spinner";
import { Divider } from "@/components/ui/divider";
import { AddIcon } from "@/components/ui/icon";

function formatTime(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getConversationTitle(
  conv: {
    type: string;
    title: string | null;
    members: { userId: string; name: string; displayName: string | null }[];
  },
  myUserId?: string
) {
  if (conv.type === "group" && conv.title) return conv.title;
  const other = conv.members.find((m) => m.userId !== myUserId);
  return other?.displayName ?? other?.name ?? "Chat";
}

export default function ChatsScreen() {
  const router = useRouter();
  const { data: me } = trpc.user.me.useQuery();
  const {
    data: conversations,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.conversation.list.useQuery(undefined, {
    refetchInterval: false,
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const onRefresh = useCallback(() => refetch(), [refetch]);

  if (isLoading) {
    return (
      <Center className="flex-1 bg-background">
        <Spinner size="large" className="text-primary" />
      </Center>
    );
  }

  return (
    <Box className="flex-1 bg-background">
      <Box className="px-4 pt-4 pb-2">
        <Button size="lg" onPress={() => navigatePush(router, "/new-chat")}>
          <ButtonIcon as={AddIcon} />
          <ButtonText>New Chat</ButtonText>
        </Button>
      </Box>

      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <Divider className="bg-border" />}
        ListEmptyComponent={
          <Center className="pt-20 px-6">
            <VStack space="sm" className="items-center">
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#94a3b8" />
              <Heading size="md" className="text-foreground">
                No conversations yet
              </Heading>
              <Text size="sm" className="text-muted-foreground text-center">
                Start a new chat to get going
              </Text>
            </VStack>
          </Center>
        }
        renderItem={({ item }) => {
          const title = getConversationTitle(item, me?.id);
          const preview = item.lastMessage?.content ?? "No messages yet";
          const unread = item.unread;

          return (
            <Pressable
              className={`px-4 py-3 ${unread ? "bg-accent/50" : "bg-card"}`}
              onPress={() => navigatePush(router, `/chat/${item.id}`)}
            >
              <HStack space="md" className="items-center">
                <Center className="h-12 w-12 rounded-full bg-primary">
                  <Text bold className="text-primary-foreground text-lg">
                    {title[0]?.toUpperCase()}
                  </Text>
                </Center>

                <VStack className="flex-1" space="xs">
                  <HStack className="items-center justify-between">
                    <Text
                      bold={unread}
                      numberOfLines={1}
                      className="text-foreground flex-1"
                    >
                      {title}
                    </Text>
                    <Text size="xs" className="text-muted-foreground">
                      {formatTime(item.lastMessage?.createdAt ?? item.updatedAt)}
                    </Text>
                  </HStack>
                  <Text size="sm" numberOfLines={1} className="text-muted-foreground">
                    {preview}
                  </Text>
                </VStack>

                {unread ? <Box className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </HStack>
            </Pressable>
          );
        }}
      />
    </Box>
  );
}
