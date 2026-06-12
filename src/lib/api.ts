import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { displayName } from '@/lib/names';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Group = Tables<'groups'>;
export type AppEvent = Tables<'events'>;
export type Photo = Tables<'photos'>;
export type Profile = Tables<'profiles'>;

export type GroupMemberFace = { name: string; avatar_url: string | null };
export type GroupSummary = Group & {
  members: GroupMemberFace[];
  liveEvent: { id: string; name: string } | null;
};
export type Member = {
  user_id: string;
  role: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};
export type PhotoWithAuthor = Photo & { username: string; avatar_url: string | null };
export type ShotCount = { user_id: string; shots: number };

export async function listGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      '*, group_members(joined_at, profiles(username, first_name, last_name, avatar_url)), events(id, name, status)'
    )
    .eq('events.status', 'active')
    .order('created_at', { ascending: false })
    .order('joined_at', { ascending: true, referencedTable: 'group_members' });
  if (error) throw error;
  return data.map(({ group_members, events, ...group }) => ({
    ...group,
    members: group_members.map((m) => ({
      name: displayName(m.profiles ?? {}),
      avatar_url: m.profiles?.avatar_url ?? null,
    })),
    liveEvent: events[0] ?? null,
  }));
}

export async function createGroup(name: string, userId: string): Promise<Group> {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function joinGroup(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group', { p_join_code: code.trim() });
  if (error) throw error;
  return data;
}

export async function getGroup(id: string): Promise<Group> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  patch: {
    username?: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

const AVATAR_BUCKET = 'avatars';

/**
 * Uploads a picked image as the user's avatar and returns its public URL.
 * Foreground user action (not the retry queue). Path is {userId}/<uuid>.<ext>
 * — RLS lets a user write only their own folder. Best-effort deletes the
 * previous file (parsed from `previousUrl`) so stale objects don't pile up.
 */
export async function uploadAvatar(
  userId: string,
  uri: string,
  previousUrl?: string | null
): Promise<string> {
  const lower = uri.toLowerCase();
  const ext = lower.endsWith('.png') ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/${Crypto.randomUUID()}.${ext}`;

  const bytes = await new File(uri).bytes();
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes.buffer as ArrayBuffer, { contentType });
  if (error) throw error;

  if (previousUrl) {
    const oldPath = avatarPathFromUrl(previousUrl);
    // Only remove files in this user's folder; ignore failures (non-fatal).
    if (oldPath && oldPath.startsWith(`${userId}/`)) {
      await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => {});
    }
  }

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Extracts the storage path from an avatars public URL, or null if it isn't one. */
function avatarPathFromUrl(url: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0] || null;
}

/** Permanently deletes the auth user and all their data (App Store 5.1.1(v)). */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
}

export async function listMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profiles(username, first_name, last_name, avatar_url)')
    .eq('group_id', groupId)
    .order('joined_at');
  if (error) throw error;
  return data.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    username: m.profiles?.username ?? 'unknown',
    first_name: m.profiles?.first_name ?? null,
    last_name: m.profiles?.last_name ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
  }));
}

export async function listEvents(groupId: string): Promise<AppEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('group_id', groupId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getEvent(id: string): Promise<AppEvent> {
  const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createEvent(groupId: string, name: string, userId: string): Promise<AppEvent> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const { data, error } = await supabase
    .from('events')
    .insert({ group_id: groupId, name: name.trim(), created_by: userId, timezone })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function endEvent(eventId: string): Promise<AppEvent> {
  const { data, error } = await supabase.rpc('end_event', { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export async function shotCounts(eventId: string): Promise<ShotCount[]> {
  const { data, error } = await supabase.rpc('event_shot_counts', { p_event_id: eventId });
  if (error) throw error;
  return data;
}

/** Only returns rows once the event has developed — enforced by RLS, not us. */
export async function listPhotos(eventId: string): Promise<PhotoWithAuthor[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*, profiles(username, avatar_url)')
    .eq('event_id', eventId)
    .order('taken_at');
  if (error) throw error;
  return data.map(({ profiles, ...photo }) => ({
    ...photo,
    username: profiles?.username ?? 'unknown',
    avatar_url: profiles?.avatar_url ?? null,
  }));
}

/**
 * Every developed photo across a group's events, newest first. RLS hides rows
 * from events that haven't developed yet, so this only ever returns the photos
 * the viewer is allowed to see — no client-side filtering required.
 */
export async function listGroupPhotos(groupId: string): Promise<PhotoWithAuthor[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*, profiles(username, avatar_url), events!inner(group_id)')
    .eq('events.group_id', groupId)
    .order('taken_at', { ascending: false });
  if (error) throw error;
  return data.map(({ profiles, events: _events, ...photo }) => ({
    ...photo,
    username: profiles?.username ?? 'unknown',
    avatar_url: profiles?.avatar_url ?? null,
  }));
}

export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage.from('photos').createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const byPath = new Map<string, string>();
  for (const entry of data) {
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }
  return byPath;
}
