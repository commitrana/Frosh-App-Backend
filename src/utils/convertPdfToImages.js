const path = require('path');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');

/**
 * Converts a PDF (as a Buffer, e.g. from multer memoryStorage) into an
 * array of JPEG buffers, one per page, in order.
 *
 * Everything happens in memory — nothing is written to disk, and the PDF
 * buffer itself is discarded by the caller once this returns. Only the
 * resulting JPEGs get uploaded to Supabase; the PDF is never stored.
 *
 * Uses pdfjs-dist + @napi-rs/canvas instead of the older `canvas` /
 * `pdf-img-convert` packages — those need node-gyp + Visual Studio Build
 * Tools to compile on Windows, which fails on most machines that don't
 * have them installed. @napi-rs/canvas ships prebuilt binaries, so
 * `npm install` just works with no compiler required.
 *
 * width: render width in pixels for each page. 1600px is plenty sharp for
 * a phone screen (pinch-zoom included) while keeping each JPEG small.
 * quality: JPEG quality (0-100). 82 is a good size/clarity balance for
 * scanned magazine pages.
 */
async function convertPdfToJpegBuffers(pdfBuffer, { width = 1600, quality = 82 } = {}) {
  // pdfjs-dist v6+ ships ESM-only, so it's loaded via dynamic import()
  // even though this file itself is CommonJS. It auto-detects it's
  // running in Node and uses @napi-rs/canvas internally for its own
  // needs; we also use @napi-rs/canvas directly below to render each
  // page to an actual image buffer.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    // Needed so PDFs using standard (non-embedded) fonts render with the
    // correct glyphs instead of silently falling back / warning.
    standardFontDataUrl: path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts/'
    ),
  });

  const pdfDoc = await loadingTask.promise;
  const jpegBuffers = [];

  try {
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = width / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      const jpeg = await sharp(pngBuffer).jpeg({ quality, mozjpeg: true }).toBuffer();
      jpegBuffers.push(jpeg);

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return jpegBuffers;
}

module.exports = { convertPdfToJpegBuffers };