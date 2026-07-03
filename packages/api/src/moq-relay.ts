const LEGACY_PUBLIC_RELAY = "relay.moq.dev";

export function resolveMoqRelayUrl(stored?: string | null): string {
  const configured = process.env.MOQ_RELAY_URL ?? "http://localhost:4443/anon";
  if (!stored || stored.includes(LEGACY_PUBLIC_RELAY)) return configured;
  return stored;
}
