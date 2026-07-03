import { API_URL } from "./config";

export function getWsUrl(): string {
  if (API_URL.startsWith("https://")) {
    return `${API_URL.replace(/^https/, "wss")}/ws`;
  }
  return `${API_URL.replace(/^http/, "ws")}/ws`;
}
