import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { applyFilmLook } from '@/lib/film-look';
import { supabase } from '@/lib/supabase';
import { cropVideoTo3x4 } from '@/lib/video-crop';

export type PendingUpload = {
  id: string;
  eventId: string;
  userId: string;
  /** Local file from the camera; absent for dev fake shots which carry bytes */
  uri: string | null;
  bytes: Uint8Array | null;
  extension: 'jpg' | 'png' | 'mov';
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

/** Same retry queue, for a recorded video clip (always a local file uri). */
export function enqueueVideo(args: { eventId: string; userId: string; uri: string }) {
  const item: PendingUpload = {
    id: Crypto.randomUUID(),
    eventId: args.eventId,
    userId: args.userId,
    uri: args.uri,
    bytes: null,
    extension: 'mov',
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

/**
 * Best-effort archive of the untouched original to the private `originals`
 * bucket (no SELECT policy — users never see it; kept for later reprocessing).
 * A failure here must NOT block the develop-able effect copy, so it's swallowed.
 */
async function archiveOriginal(item: PendingUpload, rawBytes: Uint8Array) {
  try {
    const path = `${item.eventId}/${item.userId}/${item.id}.${item.extension}`;
    const contentType = item.extension === 'png' ? 'image/png' : 'image/jpeg';
    const { error } = await supabase.storage
      .from('originals')
      .upload(path, rawBytes.buffer as ArrayBuffer, { contentType });
    if (error && !/exists/i.test(error.message)) {
      console.warn('[upload-queue] failed to archive original', error.message);
    }
  } catch (err) {
    console.warn('[upload-queue] failed to archive original', err);
  }
}

async function processUpload(item: PendingUpload) {
  // The 720×960 clip produced by the native crop, if any — cleaned up on success.
  let croppedUri: string | null = null;
  try {
    let bytes: Uint8Array;
    let extension = item.extension;

    if (item.extension === 'mov') {
      // Crop the clip to 720×960 (3:4) to match the photo frame; on any failure
      // (Android, no native module, export error) fall back to the original.
      croppedUri = await cropVideoTo3x4(item.uri!).catch(() => item.uri!);
      bytes = await new File(croppedUri).bytes();
    } else {
      // Photos get the baked-in film look (cropped to 720×960 in there), and the
      // untouched original is archived in the private `originals` bucket.
      const rawBytes = item.bytes ?? (await new File(item.uri!).bytes());
      const result = await applyFilmLook(rawBytes, item.takenAt);
      bytes = result.effectBytes;
      extension = 'jpg'; // the effect copy is always re-encoded as jpeg
      await archiveOriginal(item, result.rawBytes);
    }

    const path = `${item.eventId}/${item.userId}/${item.id}.${extension}`;
    const contentType = extension === 'jpg' ? 'image/jpeg' : 'video/quicktime';

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
    if (croppedUri && croppedUri !== item.uri) {
      try {
        new File(croppedUri).delete();
      } catch {
        // leaving the cropped temp behind is harmless
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
