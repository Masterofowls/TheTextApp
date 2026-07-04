export type RealtimeMessageEvent = {
  type: "message";
  conversationId: string;
  messageId: string;
  preview: string;
  senderName: string;
  senderId: string;
};

export type RealtimeConversationCreatedEvent = {
  type: "conversation_created";
  conversationId: string;
  conversationType: "direct" | "group";
  title: string | null;
  createdBy: string;
  creatorName: string;
};

export type RealtimeIncomingCallEvent = {
  type: "incoming_call";
  callId: string;
  conversationId: string;
  callType: "audio" | "video";
  initiatorName: string;
  initiatorId: string;
};

export type RealtimeCallEndedEvent = {
  type: "call_ended";
  callId: string;
  conversationId: string;
};

export type RealtimeCallAnsweredEvent = {
  type: "call_answered";
  callId: string;
  conversationId: string;
  answeredByUserId: string;
  answeredByName: string;
};

export type RealtimeEvent =
  | RealtimeMessageEvent
  | RealtimeConversationCreatedEvent
  | RealtimeIncomingCallEvent
  | RealtimeCallEndedEvent
  | RealtimeCallAnsweredEvent;

export type RealtimePublisher = {
  publishToUsers: (userIds: string[], event: RealtimeEvent) => void;
};
