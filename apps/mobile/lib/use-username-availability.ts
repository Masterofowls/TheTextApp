import { useEffect, useRef, useState } from "react";
import { checkUsernameAvailable } from "@/lib/auth-client";
import { isValidUsername } from "@/lib/auth-username";

export type UsernameAvailability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error";

const DEBOUNCE_MS = 400;

export function useUsernameAvailability(username: string) {
  const [status, setStatus] = useState<UsernameAvailability>("idle");
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = username.trim();

    if (!trimmed) {
      setStatus("idle");
      return;
    }

    if (!isValidUsername(trimmed)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(trimmed);
        if (requestId.current !== id) return;
        setStatus(available ? "available" : "taken");
      } catch {
        if (requestId.current !== id) return;
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [username]);

  const canUse =
    isValidUsername(username.trim()) &&
    (status === "available" || status === "idle");

  return { status, canUse };
}
