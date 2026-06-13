import ExpoModulesCore
import AVFoundation

// Target frame: 720×960 (3:4 portrait). Matches the photo crop in film-look.ts
// and the 3:4 camera finder, so every captured clip is stored at the same shape.
private let TARGET = CGSize(width: 720, height: 960)

private enum VideoCropError: Error {
  case noVideoTrack
  case exportSetupFailed
  case exportFailed(String)
}

public class VideoCropModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoCrop")

    // Center-crop a recorded clip to a 720×960 (3:4) .mov and return its file URL.
    // expo-camera records 16:9 (e.g. 720×1280 once oriented portrait); iOS has no
    // 3:4 capture preset, so we crop after the fact via an AVMutableVideoComposition.
    AsyncFunction("cropTo3x4") { (uri: String) -> String in
      return try await VideoCropModule.cropToPortrait(uri)
    }
  }

  private static func cropToPortrait(_ uri: String) async throws -> String {
    let inputURL = URL(string: uri) ?? URL(fileURLWithPath: uri)
    let asset = AVURLAsset(url: inputURL)

    let tracks = try await asset.loadTracks(withMediaType: .video)
    guard let track = tracks.first else { throw VideoCropError.noVideoTrack }

    let (naturalSize, preferredTransform) = try await track.load(.naturalSize, .preferredTransform)

    // Size of the video once its preferredTransform (orientation) is applied.
    let orientedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let orientedSize = CGSize(width: abs(orientedRect.width), height: abs(orientedRect.height))

    // Aspect-fill the oriented frame into the 720×960 target, then center it — a
    // straight vertical center-crop for the usual 720×1280 portrait clip.
    let scale = max(TARGET.width / orientedSize.width, TARGET.height / orientedSize.height)
    let scaledW = orientedSize.width * scale
    let scaledH = orientedSize.height * scale
    let tx = (TARGET.width - scaledW) / 2
    let ty = (TARGET.height - scaledH) / 2
    let cropTransform = CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: tx, ty: ty)

    // Orient first, then scale/translate into the cropped render space.
    let finalTransform = preferredTransform.concatenating(cropTransform)

    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
    layerInstruction.setTransform(finalTransform, at: .zero)

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))
    instruction.layerInstructions = [layerInstruction]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = TARGET
    let fps = try await track.load(.nominalFrameRate)
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps > 0 ? fps : 30))
    videoComposition.instructions = [instruction]

    guard
      let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality)
    else {
      throw VideoCropError.exportSetupFailed
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("mov")

    export.outputURL = outputURL
    export.outputFileType = .mov
    export.videoComposition = videoComposition
    export.shouldOptimizeForNetworkUse = true

    return try await withCheckedThrowingContinuation { continuation in
      export.exportAsynchronously {
        switch export.status {
        case .completed:
          continuation.resume(returning: outputURL.absoluteString)
        default:
          continuation.resume(
            throwing: VideoCropError.exportFailed(export.error?.localizedDescription ?? "unknown")
          )
        }
      }
    }
  }
}
