import type { NoteCode } from "./room-shared";

/** What we can tell about this device, from signals the browser volunteers. Client-side only. */
export type DeviceProfile = {
  /** A phone-class device with little memory or few CPU cores. Gets lighter video, fewer effects. */
  lowEnd: boolean;
  /** The browser reports Data Saver, or a slow mobile network. */
  constrained: boolean;
  /** Why the device was judged weak or constrained, as message codes the page translates. */
  reasons: NoteCode[];
};

type Extras = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };

export const perfKey = "screening-perf";

export function deviceProfile(): DeviceProfile {
  // A person (or a test) can force either mode: localStorage.setItem("screening-perf", "lite" | "full").
  try {
    const forced = localStorage.getItem(perfKey);
    if (forced === "lite") return { lowEnd: true, constrained: false, reasons: [{ key: "device.manual" }] };
    if (forced === "full") return { lowEnd: false, constrained: false, reasons: [{ key: "device.manual" }] };
  } catch { /* Storage can be blocked; fall through to detection. */ }

  const nav = navigator as Extras;
  const touch = matchMedia("(pointer: coarse)").matches;
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  const connection = nav.connection;

  const reasons: NoteCode[] = [];
  // Memory and core counts are only a hint, so be careful not to label a desktop with four cores as weak.
  const lowEnd = (memory !== undefined && memory <= 1) || (touch && ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 4)));
  if (lowEnd) {
    if (memory !== undefined) reasons.push({ key: "device.memory", params: { n: memory } });
    if (cores !== undefined) reasons.push({ key: "device.cores", params: { n: cores } });
  }
  const slow = ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "");
  const constrained = !!connection?.saveData || slow;
  if (connection?.saveData) reasons.push({ key: "device.saveData" });
  else if (slow) reasons.push({ key: "device.network", params: { type: connection?.effectiveType ?? "" } });
  return { lowEnd, constrained, reasons };
}
