/** Display helpers — we show people by their name, not their @username. */

type NameParts = {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

/** Short label for avatars / chips: first name, falling back to username. */
export function displayName(p: NameParts): string {
  const first = p.first_name?.trim();
  if (first) return first;
  return p.username?.trim() || 'someone';
}

/** Full "First Last" for member lists; falls back to first name, then username. */
export function fullName(p: NameParts): string {
  const first = p.first_name?.trim();
  const last = p.last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  return p.username?.trim() || 'someone';
}
