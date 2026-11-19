import type { ReactNode } from "react";

const artwork = {
  play: <path d="M8 5l12 7-12 7V5Z" fill="currentColor" stroke="none" />,
  pause: <path d="M9 5v14m6-14v14" strokeWidth="3" />,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" /></>,
  muted: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m17 10 4 4m0-4-4 4" /></>,
  // Two sliders: the Volume button, which opens the slider row. A different picture from Mute, which matters when the labels are hidden.
  levels: <><path d="M4 8h16M4 16h16" /><circle cx="9" cy="8" r="2.4" fill="currentColor" /><circle cx="15" cy="16" r="2.4" fill="currentColor" /></>,
  captions: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 13h3m3 0h4M7 10h5m3 0h2" /></>,
  expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />,
  shrink: <path d="M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5" />,
  // "Pause only me": one phone (this device) with the pause mark inside it, not the round pause that could mean the whole room.
  pauseMe: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" /><path d="M10.2 9v6m3.6-6v6" /></>,
  playMe: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" /><path d="M10.4 8.6l4.2 3.4-4.2 3.4V8.6Z" fill="currentColor" stroke="none" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3m0 13v3M4.6 4.6l2.1 2.1m10.6 10.6 2.1 2.1M2.5 12h3m13 0h3M4.6 19.4l2.1-2.1m10.6-10.6 2.1-2.1" /></>,
} satisfies Record<string, ReactNode>;

export function PlayerIcon({ name }: { name: keyof typeof artwork }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {artwork[name]}
    </svg>
  );
}
