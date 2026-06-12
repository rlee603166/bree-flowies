import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Group = Tables<'groups'>;
export type AppEvent = Tables<'events'>;
export type Photo = Tables<'photos'>;

export type GroupWithCount = Group & { memberCount: number };
export type Member = { user_id: string; role: string; username: string };
export type PhotoWithAuthor = Photo & { username: string };
export type ShotCount = { user_id: string; shots: number };

export async function listGroups(): Promise<GroupWithCount[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(({ group_members, ...group }) => ({
    ...group,
    memberCount: group_members[0]?.count ?? 0,
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

export async function listMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profiles(username)')
    .eq('group_id', groupId)
    .order('joined_at');
  if (error) throw error;
  return data.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    username: m.profiles?.username ?? 'unknown',
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
    .select('*, profiles(username)')
    .eq('event_id', eventId)
    .order('taken_at');
  if (error) throw error;
  return data.map(({ profiles, ...photo }) => ({
    ...photo,
    username: profiles?.username ?? 'unknown',
  }));
}

export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage.from('photos').createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const byPath = new Map<string, string>();
  console.log(data)
  for (const entry of data) {
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }
  return byPath;
}
