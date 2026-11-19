/**
 * The live connection to a room: one streaming HTTP request, read by hand.
 *
 * This replaces EventSource, which could not tell us the status code (so a separate request had to ask "am I allowed in?"
 * first) and had no way to notice a connection that silently died while a phone was asleep. With one request the room
 * arrives once instead of twice, and a dead connection is replaced as soon as the page wakes up.
 */

import type { ApiError } from "./i18n/core";

export type StreamHandlers = {
  /** Where to connect. Called for every attempt so a reconnect asks only for chat it has not seen. */
  url: () => string;
  /** One event from the server. `sentAt` and `receivedAt` bracket the request that produced the first one. */
  onEvent: (name: string, data: string, timing: { sentAt: number; receivedAt: number; first: boolean }) => void;
  onOpen: () => void;
  /** The connection dropped and a new attempt is scheduled. */
  onDrop: () => void;
  /** The server refused: 401 means this browser is not in the room. */
  onRefused: (status: number, payload: ApiError | null) => void;
};

/** The server sends a comment every 15 seconds. Silence for twice that long means the connection is gone. */
const silenceLimit = 35000;
const staleAfterWake = 17000;

export function openRoomStream(handlers: StreamHandlers) {
  let stopped = false;
  let controller: AbortController | undefined;
  let lastByteAt = performance.now();
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  async function run() {
    const attempt = new AbortController();
    controller = attempt;
    const sentAt = performance.now();
    lastByteAt = sentAt;
    let first = true;
    try {
      const response = await fetch(handlers.url(), { cache: "no-store", signal: attempt.signal, headers: { Accept: "text/event-stream" } });
      if (stopped || attempt.signal.aborted) return;
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as ApiError | null;
        // A 5xx or a network hiccup is worth retrying. A 4xx will not get better by asking again.
        if (response.status >= 400 && response.status < 500) {
          stopped = true;
          handlers.onRefused(response.status, payload);
          return;
        }
        throw new Error(`Status ${response.status}`);
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      handlers.onOpen();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        lastByteAt = performance.now();
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let name = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
          }
          if (!data) continue; // A comment (the heartbeat).
          failures = 0;
          handlers.onEvent(name, data, { sentAt, receivedAt: lastByteAt, first });
          first = false;
        }
      }
    } catch { /* Fall through to the retry below. */ }
    if (stopped || attempt.signal.aborted && controller !== attempt) return;
    schedule();
  }

  function schedule() {
    handlers.onDrop();
    // Quick first retries, because a phone that just changed networks usually recovers at once; then back off.
    const delay = Math.min(5000, 250 * 2 ** failures) * (0.75 + Math.random() * 0.5);
    failures++;
    clearTimeout(retry);
    retry = setTimeout(() => { if (!stopped) void run(); }, delay);
  }

  /** Throw away the current connection and start a fresh one now. */
  function restart() {
    if (stopped) return;
    clearTimeout(retry);
    const old = controller;
    controller = undefined;
    old?.abort();
    failures = 0;
    void run();
  }

  const watchdog = setInterval(() => {
    if (!stopped && performance.now() - lastByteAt > silenceLimit) restart();
  }, 5000);

  // Timers freeze while a phone sleeps, so after waking, do not wait for the watchdog: a connection that has been
  // quiet for longer than a heartbeat is replaced immediately.
  const onVisible = () => {
    if (!document.hidden && !stopped && performance.now() - lastByteAt > staleAfterWake) restart();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", restart);

  void run();

  return {
    close() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(watchdog);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", restart);
    },
  };
}
