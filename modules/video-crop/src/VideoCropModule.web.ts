import { registerWebModule, NativeModule } from 'expo';

// VideoCrop is iOS-only; on web (and as a safety net) it passes the clip through.
class VideoCropModule extends NativeModule<{}> {
  async cropTo3x4(uri: string): Promise<string> {
    return uri;
  }
}

export default registerWebModule(VideoCropModule, 'VideoCropModule');
