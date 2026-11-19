// Subtitle timing and text handling. Pure functions with no browser APIs, so they can be tested on their own.

export type Cue = { id: string; start: number; end: number; text: string };

export type CueList = { cues: Cue[]; /** The longest single cue, in seconds. Lets the lookup stop scanning early. */ longest: number };

export type Timing = {
  /** Seconds to shift every cue. Positive shows subtitles later, negative earlier. */
  delay: number;
  /** Extra seconds each line stays on screen after it ends, so slow readers can catch up. */
  stay: number;
  /** How many lines may show at once. At 1 a new line replaces the old one. */
  stack: number;
};

/** Sort raw cues by start time and note the longest one. */
export function prepareCues(raw: { startTime: number; endTime: number; text: string; id?: string }[]): CueList {
  const cues = raw
    .map((cue, index) => ({ id: `${index}`, start: cue.startTime, end: cue.endTime, text: cue.text }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  cues.forEach((cue, index) => { cue.id = `${index}`; });
  let longest = 0;
  for (const cue of cues) longest = Math.max(longest, cue.end - cue.start);
  return { cues, longest };
}

/**
 * The cues to show at `time`, oldest first (so the newest line ends up at the bottom of the stack).
 * A cue is visible from its start until its end plus the stay time, all shifted by the delay.
 */
export function visibleCues({ cues, longest }: CueList, time: number, { delay, stay, stack }: Timing): Cue[] {
  // The first cue that has not started yet (binary search): everything before it has started.
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].start + delay > time) high = middle;
    else low = middle + 1;
  }

  const found: Cue[] = [];
  for (let index = low - 1; index >= 0 && found.length < Math.max(1, stack); index--) {
    const cue = cues[index];
    // Earlier cues start earlier, so once one is too old even at the longest length, so are all the rest.
    if (cue.start + delay + longest + stay < time) break;
    if (time < cue.end + delay + stay) found.push(cue);
  }
  return found.reverse();
}

/**
 * How many seconds until what is on screen could next change: the next cue starting, or a cue that is up (or waiting
 * behind the stack limit) coming to its end. Infinity when nothing more will happen. Lets the page wake exactly when it
 * has to instead of checking ten times a second.
 */
export function secondsUntilChange({ cues, longest }: CueList, time: number, { delay, stay }: Timing): number {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].start + delay > time) high = middle;
    else low = middle + 1;
  }
  let soonest = low < cues.length ? cues[low].start + delay - time : Infinity;
  for (let index = low - 1; index >= 0; index--) {
    const cue = cues[index];
    if (cue.start + delay + longest + stay < time) break;
    const ends = cue.end + delay + stay - time;
    if (ends > 0 && ends < soonest) soonest = ends;
  }
  return soonest;
}

const allowedTags = new Set(["i", "b", "u"]);

/**
 * Turn a cue's WebVTT text into safe HTML. Everything is escaped except italic, bold and underline, which are
 * kept. Other tags (voice, class, language, timestamps) are dropped but their text stays.
 */
export function cueHtml(text: string): string {
  return text
    .split(/(<[^>]*>)/)
    .map(part => {
      const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:[.\s][^>]*)?>$/.exec(part);
      if (tag) return allowedTags.has(tag[2].toLowerCase()) ? `<${tag[1]}${tag[2].toLowerCase()}>` : "";
      if (/^<[^>]*>$/.test(part)) return ""; // timestamp tags and anything else shaped like a tag
      // Keep entities the subtitle already wrote (&amp; and friends), escape the rest.
      return part.replace(/&(?!(?:amp|lt|gt|nbsp|lrm|rlm|quot|#\d+);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("");
}
