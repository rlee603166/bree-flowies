/** Invite links encoded in group QR codes: breeflowies://join/<CODE>. */

export function inviteLink(code: string): string {
  return `breeflowies://join/${encodeURIComponent(code.trim().toUpperCase())}`;
}

/**
 * Pull a join code out of whatever a QR scan returns — our own invite link,
 * a bare code, or a code wrapped in some other URL. Returns null if nothing
 * looks like a code.
 */
export function codeFromScan(data: string): string | null {
  const trimmed = data.trim();
  const linkMatch = trimmed.match(/join\/([^/?#\s]+)/i);
  if (linkMatch) return decodeURIComponent(linkMatch[1]).toUpperCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}
