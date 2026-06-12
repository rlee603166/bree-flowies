import type { RealtimeChannel } from '@supabase/supabase-js';

import type { AppEvent } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type Unsubscribe = () => void;

/** Per-photo signal carried over the group broadcast topic — no image data. */
export type ShotEvent = { event_id: string; taken_by: string };

function cleanup(channel: RealtimeChannel): Unsubscribe {
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Fires whenever any event the current user can see is inserted/updated.
 * RLS scopes delivery to the user's own groups, so this is safe to leave
 * unfiltered — used by the groups list to light up / clear "live now".
 */
export function onAnyEventChange(handler: () => void): Unsubscribe {
  const channel = supabase
    .channel('events-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, handler)
    .subscribe();
  return cleanup(channel);
}

/**
 * Live activity for a single group: event start/end (postgres changes) plus
 * per-shot broadcasts for live counts. Both ride one private channel whose
 * topic (`group:<id>`) is gated by the realtime.messages RLS policy.
 */
export function onGroupActivity(
  groupId: string,
  handlers: { onEventsChange: () => void; onShot: (shot: ShotEvent) => void }
): Unsubscribe {
  const channel = supabase
    .channel(`group:${groupId}`, { config: { private: true } })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events', filter: `group_id=eq.${groupId}` },
      handlers.onEventsChange
    )
    .on('broadcast', { event: 'photo_added' }, ({ payload }) =>
      handlers.onShot(payload as ShotEvent)
    )
    .subscribe();
  return cleanup(channel);
}

/** Fires when a single event row changes — used to detect the host ending a roll. */
export function onEventChange(eventId: string, handler: (event: AppEvent) => void): Unsubscribe {
  const channel = supabase
    .channel(`event-watch:${eventId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
      ({ new: row }) => handler(row as AppEvent)
    )
    .subscribe();
  return cleanup(channel);
}
