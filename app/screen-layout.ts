/**
 * A phone turned sideways: wide and short. The aspect-ratio test matters. A portrait phone with its keyboard open is short
 * too, but nearly square, and must not be mistaken for a sideways phone (the layout would switch and close the keyboard).
 */
export const landscapePhoneQuery = "(orientation: landscape) and (max-height: 31rem) and (min-aspect-ratio: 3/2)";

/** True when the picture is the main thing on screen: full screen, or a phone held sideways. The chat panel is out of sight then. */
export function isRotatedView() {
  return !!document.fullscreenElement || matchMedia(landscapePhoneQuery).matches;
}

/** "Sam", "Sam and Kim", "Sam, Kim and Lee", "Sam, Kim and 3 others", joined the way the viewer's language does it. */
export function listNames(names: string[], locale: string, others: (count: number) => string) {
  const shown = names.length <= 3 ? names : [names[0], names[1], others(names.length - 2)];
  try { return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(shown); }
  catch { return shown.join(", "); }
}
