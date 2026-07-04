const LEGACY_PUBLIC_RELAY = "relay.moq.dev";

/** Server-side URL to fetch /certificate.sha256 (plain HTTP on Fly TCP/443). */
export function moqCertProbeUrl(relayUrl: string): string {
  try {
    const parsed = new URL(relayUrl);
    if (parsed.hostname.endsWith(".fly.dev")) {
      parsed.protocol = "http:";
      parsed.port = "443";
      parsed.pathname = "/certificate.sha256";
      parsed.search = "";
      return parsed.toString();
    }
    const normalized = normalizeMoqRelayUrl(relayUrl);
    return `${new URL(normalized).origin}/certificate.sha256`;
  } catch {
    return "http://localhost:4443/certificate.sha256";
  }
}

/** Browser WebTransport URL — HTTPS on Fly with cert pinning via API-fetched hash. */
export function moqWebTransportUrl(relayUrl: string): string {
  try {
    const parsed = new URL(relayUrl);
    if (parsed.hostname.endsWith(".fly.dev")) {
      parsed.protocol = "https:";
      parsed.port = "443";
      return parsed.toString();
    }
  } catch {
    /* fall through */
  }
  return normalizeMoqRelayUrl(relayUrl);
}

/** Local/docker relay URL (`http://host:4443/...`). */
export function normalizeMoqRelayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".fly.dev")) {
      return moqWebTransportUrl(url);
    }
    if (parsed.protocol === "https:" && parsed.port === "") {
      parsed.protocol = "http:";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function relayCertFingerprintUrl(relayUrl: string): string {
  return moqCertProbeUrl(relayUrl);
}

export function resolveMoqRelayUrl(stored?: string | null): string {
  const raw =
    process.env.MOQ_RELAY_URL ??
    process.env.EXPO_PUBLIC_MOQ_RELAY_URL ??
    "http://localhost:4443/anon";

  const configured = stored?.includes(LEGACY_PUBLIC_RELAY) || !stored ? raw : stored;
  return moqWebTransportUrl(configured);
}

export function isRelayReachableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ERR_NAME_NOT_RESOLVED") ||
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("ERR_SSL_PROTOCOL") ||
    message.includes("CONNECTION_REFUSED") ||
    message.includes("Failed to fetch") ||
    message.includes("WebSocket connection") ||
    message.includes("unreachable") ||
    message.includes("network")
  );
}

/** Fetch cert fingerprint — use API proxy for Fly (browsers block HTTP to port 443). */
export async function fetchRelayCertHash(
  relayUrl: string,
  apiBaseUrl?: string
): Promise<string | null> {
  const isFly = relayUrl.includes(".fly.dev");
  const certUrl =
    isFly && apiBaseUrl
      ? `${apiBaseUrl.replace(/\/$/, "")}/moq/certificate.sha256`
      : relayCertFingerprintUrl(relayUrl);

  try {
    const response = await fetch(certUrl);
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function probeRelayReachable(
  relayUrl: string,
  apiBaseUrl?: string,
  timeoutMs = 5000
): Promise<boolean> {
  if (typeof fetch === "undefined") return false;

  const isFly = relayUrl.includes(".fly.dev");
  const certUrl =
    isFly && apiBaseUrl
      ? `${apiBaseUrl.replace(/\/$/, "")}/moq/certificate.sha256`
      : relayCertFingerprintUrl(relayUrl);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(certUrl, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function relaySetupHint(relayUrl?: string): string {
  if (relayUrl?.includes(".fly.dev")) {
    return "Fly MoQ relay: https://thetextapp-moq.fly.dev/anon (cert via API proxy). If calls fail, check fly status for thetextapp-moq.";
  }
  return "Local dev: docker compose -f infra/docker/moq-relay.yml up -d — MOQ_RELAY_URL=http://localhost:4443/anon";
}
