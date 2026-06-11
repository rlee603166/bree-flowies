import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

export type PendingUpload = {
  id: string;
  eventId: string;
  userId: string;
  /** Local file from the camera; absent for dev fake shots which carry bytes */
  uri: string | null;
  bytes: Uint8Array | null;
  extension: 'jpg' | 'png';
  takenAt: string;
  attempts: number;
  status: 'uploading' | 'failed';
};

const MAX_ATTEMPTS = 3;

let queue: PendingUpload[] = [];
const listeners = new Set<() => void>();

function emit() {
  queue = [...queue]; // new reference so useSyncExternalStore sees the change
  listeners.forEach((listener) => listener());
}

export function subscribeToUploads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUploads(): PendingUpload[] {
  return queue;
}

export function enqueuePhoto(args: {
  eventId: string;
  userId: string;
  uri?: string;
  bytes?: Uint8Array;
}) {
  const item: PendingUpload = {
    id: Crypto.randomUUID(),
    eventId: args.eventId,
    userId: args.userId,
    uri: args.uri ?? null,
    bytes: args.bytes ?? null,
    extension: args.uri ? 'jpg' : 'png',
    takenAt: new Date().toISOString(),
    attempts: 0,
    status: 'uploading',
  };
  queue.push(item);
  emit();
  void processUpload(item);
}

export function retryFailedUploads() {
  for (const item of queue) {
    if (item.status === 'failed') {
      item.status = 'uploading';
      item.attempts = 0;
      void processUpload(item);
    }
  }
  emit();
}

async function processUpload(item: PendingUpload) {
  try {
    const bytes = item.bytes ?? (await new File(item.uri!).bytes());
    const path = `${item.eventId}/${item.userId}/${item.id}.${item.extension}`;
    const contentType = item.extension === 'jpg' ? 'image/jpeg' : 'image/png';

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, bytes.buffer as ArrayBuffer, { contentType });
    // "already exists" means a previous attempt got the file up before failing
    if (uploadError && !/exists/i.test(uploadError.message)) throw uploadError;

    // No .select() here: the inserted row is invisible to us until the event
    // develops, so RETURNING would be rejected by the photos SELECT policy.
    const { error: insertError } = await supabase.from('photos').insert({
      id: item.id,
      event_id: item.eventId,
      taken_by: item.userId,
      storage_path: path,
      taken_at: item.takenAt,
    });
    // 23505 = retry raced a previous half-finished attempt; the row is there
    if (insertError && insertError.code !== '23505') throw insertError;

    if (item.uri) {
      try {
        new File(item.uri).delete();
      } catch {
        // leaving the temp file behind is harmless
      }
    }
    queue = queue.filter((q) => q.id !== item.id);
    emit();
  } catch {
    item.attempts += 1;
    if (item.attempts < MAX_ATTEMPTS) {
      setTimeout(() => void processUpload(item), 1500 * item.attempts);
    } else {
      item.status = 'failed';
      emit();
    }
  }
}
