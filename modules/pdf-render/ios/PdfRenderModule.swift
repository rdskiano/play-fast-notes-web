import CoreImage
import ExpoModulesCore
import PDFKit
import UIKit

// Renders one page of a PDF to a JPEG on disk using PDFKit. Exposed to JS as an
// async function so the (potentially slow) rasterize runs off the JS thread.
public class PdfRenderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfRender")

    AsyncFunction("renderPage") {
      (pdfUri: String, pageNumber: Int, maxEdge: Double, outputUri: String) -> String in

      let pdfURL = PdfRenderModule.fileURL(from: pdfUri)
      guard let document = PDFDocument(url: pdfURL) else {
        throw PdfRenderError("Could not open PDF at \(pdfUri)")
      }

      // pageNumber is 1-based (matches pdf.js / pages_json); PDFKit is 0-based.
      let pageIndex = pageNumber - 1
      guard pageIndex >= 0, pageIndex < document.pageCount,
            let page = document.page(at: pageIndex) else {
        throw PdfRenderError("Page \(pageNumber) out of range (1...\(document.pageCount))")
      }

      // Use the cropBox (the visible page area) so the aspect ratio matches what
      // pdf.js renders by default — keeps the passage-box overlay math aligned.
      let bounds = page.bounds(for: .cropBox)
      let longEdge = max(bounds.width, bounds.height)
      let scale = longEdge > 0 ? CGFloat(maxEdge) / longEdge : 1.0
      let size = CGSize(
        width: max(1, bounds.width * scale),
        height: max(1, bounds.height * scale)
      )

      // thumbnail(of:for:) draws the page (handling rotation) into a UIImage,
      // but at the SCREEN scale (2x/3x on Retina) — so its pixel dimensions are
      // 2-3x `size`. Passage crops use 1x coordinates (pages_json), so a 2x
      // image makes crops grab the wrong region. Redraw into a scale-1 renderer
      // so the JPEG is EXACTLY `size` pixels and crop coordinates line up.
      let thumb = page.thumbnail(of: size, for: .cropBox)
      let format = UIGraphicsImageRendererFormat.default()
      format.scale = 1
      let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        thumb.draw(in: CGRect(origin: .zero, size: size))
      }
      guard let data = image.jpegData(compressionQuality: 0.82) else {
        throw PdfRenderError("Failed to encode page \(pageNumber) as JPEG")
      }

      let outURL = PdfRenderModule.fileURL(from: outputUri)
      do {
        try data.write(to: outURL, options: .atomic)
      } catch {
        throw PdfRenderError("Failed to write page image: \(error.localizedDescription)")
      }
      return outURL.absoluteString
    }

    // Read each page's dimensions without rasterizing, SCALED so the long edge
    // equals maxEdge — the same scale renderPage rasterizes at and the web's
    // getPdfPageSizes stores. This is what makes pages_json and the rendered
    // page image share a coordinate space, so passage-crop rectangles (stored
    // against pages_json) land on the right region. Returns 1-based index + w/h.
    AsyncFunction("getPageSizes") { (pdfUri: String, maxEdge: Double) -> [[String: Double]] in
      let url = PdfRenderModule.fileURL(from: pdfUri)
      guard let document = PDFDocument(url: url) else {
        throw PdfRenderError("Could not open PDF at \(pdfUri)")
      }
      var sizes: [[String: Double]] = []
      for i in 0..<document.pageCount {
        guard let page = document.page(at: i) else { continue }
        let b = page.bounds(for: .cropBox)
        let longEdge = max(b.width, b.height)
        let scale = longEdge > 0 ? maxEdge / longEdge : 1.0
        sizes.append([
          "index": Double(i + 1),
          "w": Double(b.width * scale),
          "h": Double(b.height * scale),
        ])
      }
      return sizes
    }

    // Clean up a scanned page for a "black & white document" look: drop colour
    // and lift contrast a touch (what iOS's own scanner B&W filter effectively
    // does). Kept as grayscale-with-contrast rather than 1-bit threshold so thin
    // staff lines survive. Writes a JPEG to outputUri; returns its pixel size.
    AsyncFunction("enhanceScan") { (uri: String, outputUri: String) -> [String: Double] in
      let inURL = PdfRenderModule.fileURL(from: uri)
      guard let input = CIImage(contentsOf: inURL) else {
        throw PdfRenderError("Could not read scanned image at \(uri)")
      }
      let processed = input.applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 0.0,
        kCIInputContrastKey: 1.15,
        kCIInputBrightnessKey: 0.0,
      ])
      let context = CIContext(options: nil)
      guard let cg = context.createCGImage(processed, from: processed.extent) else {
        throw PdfRenderError("Failed to process scanned image")
      }
      let image = UIImage(cgImage: cg)
      guard let data = image.jpegData(compressionQuality: 0.85) else {
        throw PdfRenderError("Failed to encode enhanced scan")
      }
      let outURL = PdfRenderModule.fileURL(from: outputUri)
      do {
        try data.write(to: outURL, options: .atomic)
      } catch {
        throw PdfRenderError("Failed to write enhanced scan: \(error.localizedDescription)")
      }
      return ["width": Double(cg.width), "height": Double(cg.height)]
    }
  }

  // Accept either a file:// URI (what expo-file-system hands us) or a bare path.
  private static func fileURL(from value: String) -> URL {
    if value.hasPrefix("file://"), let url = URL(string: value) {
      return url
    }
    return URL(fileURLWithPath: value)
  }
}

private struct PdfRenderError: Error, LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
