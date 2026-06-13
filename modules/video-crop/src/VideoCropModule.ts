import { NativeModule, requireNativeModule } from 'expo';

declare class VideoCropModule extends NativeModule<{}> {
  /** Center-crop a recorded clip to 720×960 (3:4); resolves with the new file URL. */
  cropTo3x4(uri: string): Promise<string>;
}

export default requireNativeModule<VideoCropModule>('VideoCrop');
