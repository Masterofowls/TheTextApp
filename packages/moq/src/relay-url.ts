const LEGACY_PUBLIC_RELAY = "relay.moq.dev";

/** Resolve MoQ relay URL — public relay.moq.dev often fails DNS; prefer local docker relay in dev. */
export function resolveMoqRelayUrl(stored?: string | null): string {
  const configured =
    process.env.MOQ_RELAY_URL ??
    process.env.EXPO_PUBLIC_MOQ_RELAY_URL ??
    "http://localhost:4443/anon";

  if (!stored || stored.includes(LEGACY_PUBLIC_RELAY)) {
    return configured;
  }
  return stored;
}

export function isRelayReachableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ERR_NAME_NOT_RESOLVED") ||
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("CONNECTION_REFUSED") ||
    message.includes("Failed to fetch") ||
    message.includes("WebSocket connection") ||
    message.includes("unreachable") ||
    message.includes("network")
  );
}

/** Quick check before MoQ connect — avoids noisy WebTransport/WebSocket retries when relay is down. */
export async function probeRelayReachable(
  relayUrl: string,
  timeoutMs = 2500
): Promise<boolean> {
  if (typeof fetch === "undefined") return false;

  try {
    const origin = new URL(relayUrl).origin;
    const certUrl = `${origin}/certificate.sha256`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(certUrl, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function relaySetupHint(): string {
  return "Start a local MoQ relay: docker compose -f infra/docker/moq-relay.yml up -d — then set MOQ_RELAY_URL=http://localhost:4443/anon";
}
