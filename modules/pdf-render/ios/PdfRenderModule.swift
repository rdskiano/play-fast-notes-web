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

      // thumbnail(of:for:) draws the page (handling rotation) into a UIImage.
      let image = page.thumbnail(of: size, for: .cropBox)
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
