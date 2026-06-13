import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

type MediaExt = 'jpg' | 'png' | 'mov';

// Signed URLs end in the storage path (…/<uuid>.jpg) followed by a query
// string, so strip the query before reading the extension.
function extFromUrl(url: string): MediaExt {
  const path = url.split('?')[0];
  if (/\.mov$/i.test(path)) return 'mov';
  return /\.png$/i.test(path) ? 'png' : 'jpg';
}

const MIME: Record<MediaExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  mov: 'video/quicktime',
};

// Pull a fresh signed URL down into a private cache file we control the name
// of, so the share sheet / camera roll get a sensibly-named image rather than
// a uuid with a query string. Returns the local file:// uri.
async function downloadToCache(url: string, photoId: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'shared-photos');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `breeflowies-${photoId}.${extFromUrl(url)}`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  return file.uri;
}

/** Open the OS share sheet for a photo. Resolves false if sharing is unavailable. */
export async function sharePhoto(url: string, photoId: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = await downloadToCache(url, photoId);
  await Sharing.shareAsync(uri, { mimeType: MIME[extFromUrl(url)] });
  return true;
}

export type SaveResult = 'saved' | 'denied';

/** Save a photo to the device camera roll, prompting for permission if needed. */
export async function savePhotoToLibrary(url: string, photoId: string): Promise<SaveResult> {
  const perm = await MediaLibrary.requestPermissionsAsync(true /* writeOnly */);
  if (!perm.granted) return 'denied';
  const uri = await downloadToCache(url, photoId);
  await MediaLibrary.Asset.create(uri);
  return 'saved';
}
