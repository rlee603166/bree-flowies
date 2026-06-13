import type { AppEvent } from '@/lib/api';

export type EventPhase = 'active' | 'developing' | 'developed';

export function eventPhase(event: Pick<AppEvent, 'status' | 'develops_at'>): EventPhase {
  if (event.status === 'active') return 'active';
  if (event.develops_at && Date.now() >= new Date(event.develops_at).getTime()) return 'developed';
  return 'developing';
}

export function formatDevelopTime(developsAt: string | null): string {
  if (!developsAt) return 'soon';
  const date = new Date(developsAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

export function formatEventDate(startedAt: string): string {
  return new Date(startedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatEventDateNumeric(startedAt: string): string {
    return new Date(startedAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
    });
}
