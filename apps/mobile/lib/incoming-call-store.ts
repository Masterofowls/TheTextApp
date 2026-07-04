import type {
  RealtimeCallAnsweredEvent,
  RealtimeCallEndedEvent,
  RealtimeIncomingCallEvent,
} from "@thetextapp/api/realtime-types";

type Listener = () => void;

let incomingCall: RealtimeIncomingCallEvent | null = null;
const incomingListeners = new Set<Listener>();

const answeredListeners = new Set<(event: RealtimeCallAnsweredEvent) => void>();
const endedListeners = new Set<(event: RealtimeCallEndedEvent) => void>();

export function getIncomingCall(): RealtimeIncomingCallEvent | null {
  return incomingCall;
}

export function setIncomingCall(call: RealtimeIncomingCallEvent | null) {
  incomingCall = call;
  for (const listener of incomingListeners) listener();
}

export function dismissIncomingCall(callId: string) {
  if (incomingCall?.callId === callId) {
    setIncomingCall(null);
  }
}

export function subscribeIncomingCall(listener: Listener) {
  incomingListeners.add(listener);
  return () => {
    incomingListeners.delete(listener);
  };
}

export function emitCallAnswered(event: RealtimeCallAnsweredEvent) {
  dismissIncomingCall(event.callId);
  for (const listener of answeredListeners) listener(event);
}

export function subscribeCallAnswered(listener: (event: RealtimeCallAnsweredEvent) => void) {
  answeredListeners.add(listener);
  return () => {
    answeredListeners.delete(listener);
  };
}

export function emitCallEnded(event: RealtimeCallEndedEvent) {
  dismissIncomingCall(event.callId);
  for (const listener of endedListeners) listener(event);
}

export function subscribeCallEnded(listener: (event: RealtimeCallEndedEvent) => void) {
  endedListeners.add(listener);
  return () => {
    endedListeners.delete(listener);
  };
}
