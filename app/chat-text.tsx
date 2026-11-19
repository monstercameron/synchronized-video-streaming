import type { ReactNode } from "react";

/** Words that mention everyone in the room. */
export const groupMentions = ["everyone", "here"];

const word = "\\p{L}\\p{N}_";

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionPattern(names: string[]) {
  // Longest names first so "@Ann Marie" wins over "@Ann".
  const options = [...names, ...groupMentions].filter(Boolean).sort((a, b) => b.length - a.length).map(escape);
  return `(^|[^${word}@])@(${options.join("|")})(?![${word}])`;
}

// Building these patterns is the expensive part of rendering a message, and the same few are needed
// again on every render. Keep the most recent ones.
const patterns = new Map<string, RegExp>();

function cached(key: string, flags: string, source: () => string) {
  const id = `${flags}\u0000${key}`;
  let pattern = patterns.get(id);
  if (!pattern) {
    if (patterns.size >= 12) patterns.delete(patterns.keys().next().value!);
    pattern = new RegExp(source(), flags);
    patterns.set(id, pattern);
  }
  return pattern;
}

export function mentionsName(text: string, name: string) {
  // Not a global pattern, so .test() keeps no state between calls.
  return cached(name, "iu", () => mentionPattern([name])).test(text);
}

const urlPattern = "(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)\"'\\]])";

/** Message text with @mentions highlighted and web links made clickable. */
export function MessageText({ text, names, me }: { text: string; names: string[]; me: string }) {
  // matchAll works on a copy of the pattern, so sharing one cached instance is safe.
  const pattern = cached(names.join("\u0000"), "giu", () => `${mentionPattern(names)}|${urlPattern}`);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const [whole, lead, mention, url] = match;
    const start = match.index;
    if (url) {
      if (start > cursor) parts.push(text.slice(cursor, start));
      parts.push(<a key={start} href={url} target="_blank" rel="noopener noreferrer">{url}</a>);
    } else {
      if (start + lead.length > cursor) parts.push(text.slice(cursor, start + lead.length));
      const you = mention.toLowerCase() === me.toLowerCase() || groupMentions.includes(mention.toLowerCase());
      parts.push(<mark key={start} className="mention" data-you={you}>@{mention}</mark>);
    }
    cursor = start + whole.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
