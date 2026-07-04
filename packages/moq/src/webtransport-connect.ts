import { Connection } from "@moq/net";

type MoqConnectProps = NonNullable<Parameters<typeof Connection.connect>[1]>;

const MOQ_ALPN_PROTOCOLS = [
  "moq-lite-04",
  "moq-lite-03",
  "moql",
  "moqt-18",
  "moqt-17",
  "moqt-16",
  "moqt-15",
] as const;

export function isFirefoxBrowser(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("firefox")
  );
}

export function isFlyRelayUrl(url: string): boolean {
  return url.includes(".fly.dev");
}

function certHashToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().startsWith("0x") ? hex.trim().slice(2) : hex.trim();
  if (normalized.length % 2 !== 0) {
    throw new Error("invalid certificate hash length");
  }
  const pairs = normalized.match(/.{2}/g);
  if (!pairs) throw new Error("invalid certificate hash format");
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
}

/** @moq/net skips WebTransport on Firefox; our Fly relay has no WebSocket — connect QUIC directly. */
export async function createPinnedWebTransport(
  url: URL,
  certHashHex: string
): Promise<WebTransport> {
  if (typeof WebTransport === "undefined") {
    throw new Error("WebTransport is not supported in this browser");
  }

  const transport = new WebTransport(url, {
    allowPooling: false,
    congestionControl: "low-latency",
    protocols: [...MOQ_ALPN_PROTOCOLS],
    serverCertificateHashes: [{ algorithm: "sha-256", value: certHashToBytes(certHashHex) }],
  });

  transport.closed.catch(() => {});
  await transport.ready;
  return transport;
}

export function moqConnectOptionsForRelay(
  relayUrl: string,
  certHashHex: string | null
): MoqConnectProps {
  const fly = isFlyRelayUrl(relayUrl);
  if (!certHashHex) {
    return { websocket: { enabled: !fly } };
  }

  return {
    websocket: { enabled: !fly },
    webtransport: {
      serverCertificateHashes: [{ algorithm: "sha-256", value: certHashHex }],
    },
  };
}

export async function connectFlyWebTransport(
  relayUrl: URL,
  certHashHex: string
): Promise<WebTransport> {
  return createPinnedWebTransport(relayUrl, certHashHex);
}
