export type RealtimeMessageEvent = {
  type: "message";
  conversationId: string;
  messageId: string;
  preview: string;
  senderName: string;
  senderId: string;
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

export type RealtimeEvent =
  | RealtimeMessageEvent
  | RealtimeIncomingCallEvent
  | RealtimeCallEndedEvent;

export type RealtimePublisher = {
  publishToUsers: (userIds: string[], event: RealtimeEvent) => void;
};
