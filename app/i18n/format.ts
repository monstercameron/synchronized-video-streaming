const formats = new Map<string, Intl.NumberFormat>();

/** A number written the way the viewer's language writes it: 1.4 in English, 1,4 in Spanish. */
export function formatNumber(locale: string, value: number, fractionDigits = 0) {
  const key = `${locale}:${fractionDigits}`;
  let format = formats.get(key);
  if (!format) { format = new Intl.NumberFormat(locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }); formats.set(key, format); }
  return format.format(value);
}
