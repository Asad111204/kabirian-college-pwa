/**
 * "Chrome on Windows" from a User-Agent string.
 *
 * Just enough for a person to recognise their own devices on the signed-in
 * devices list. It is deliberately a handful of substring checks and not a
 * parsing library: the answer only has to be recognisable, not exact, and a
 * wrong guess costs nothing.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  const ua = userAgent

  const os = /iPhone|iPad|iPod/.test(ua)
    ? /iPad/.test(ua)
      ? 'iPad'
      : 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null

  // Order matters: Edge and Opera also say "Chrome"; Chrome also says "Safari".
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null

  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return os
  return 'Unknown device'
}
