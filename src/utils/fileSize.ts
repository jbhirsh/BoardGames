/** "16.4 MB", "850 KB": a file size as someone on mobile data would want it. */
export function formatSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${Math.round(bytes / 100_000) / 10} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
