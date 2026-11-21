const { parentPort, workerData } = require('node:worker_threads');

const pdfOptions = {
  isEvalSupported: false,
  useWorkerFetch: false,
  useSystemFonts: false,
  disableFontFace: true,
  maxImageSize: 16_000_000
};
const loadCanvas = () => import('@napi-rs/canvas');

async function renderPages(buffer, pageNumbers) {
  if (!pageNumbers.length) return [];
  const { getDocumentProxy, createIsomorphicCanvasFactory, renderPageAsImage } = await import('unpdf');
  const sharp = require('sharp');
  const CanvasFactory = await createIsomorphicCanvasFactory(loadCanvas);
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { ...pdfOptions, CanvasFactory });
  try {
    const images = [];
    for (const pageNumber of pageNumbers) {
      try {
        const page = await pdf.getPage(pageNumber);
        const { width, height } = page.getViewport({ scale: 1 });
        const size = Math.max(width, height);
        if (!Number.isFinite(size) || Math.min(width, height) <= 0) continue;
        const png = await renderPageAsImage(pdf, pageNumber, {
          canvasImport: loadCanvas, scale: Math.min(3, 1900 / size)
        });
        const image = await sharp(Buffer.from(png)).flatten({ background: '#ffffff' })
          .jpeg({ quality: 89, chromaSubsampling: '4:4:4' }).toBuffer();
        const { channels } = await sharp(image).stats();
        if (!channels.some(channel => channel.stdev >= 1.25)) continue;
        images.push({ page: pageNumber, image });
        page.cleanup();
      } catch {
        // Keep the other pages available when one page cannot be rendered.
      }
    }
    return images;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

async function extract() {
  const { getDocumentProxy } = await import('unpdf');
  const { buffer, pageLimit, textLimit, visual, requestedPages, visualLimit } = workerData;
  const pdf = await getDocumentProxy(new Uint8Array(buffer), pdfOptions);
  const pages = [];
  const emptyPages = [];
  let remaining = textLimit;
  let pagesRead = 0;
  let truncated = pdf.numPages > pageLimit;
  const totalPages = pdf.numPages;
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, pageLimit) && remaining > 0; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const text = items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      truncated ||= text.length > remaining;
      const excerpt = text.slice(0, remaining).toWellFormed();
      if (excerpt) pages.push({ page: pageNumber, text: excerpt });
      else emptyPages.push(pageNumber);
      remaining -= excerpt.length;
      pagesRead += 1;
      page.cleanup();
    }
  } finally {
    await pdf.loadingTask.destroy();
  }

  const selected = new Set([
    ...requestedPages,
    ...(visual && !requestedPages.length ? pages.filter(page => /图表|图\s*\d|图例|figure|chart/i.test(page.text)).map(page => page.page) : []),
    ...emptyPages
  ]);
  if (visual && !requestedPages.length) {
    for (let page = 1; page <= Math.min(totalPages, visualLimit); page++) selected.add(page);
  }
  const validPages = [...selected].filter(page => page <= totalPages);
  const images = await renderPages(buffer, validPages.slice(0, visualLimit)).catch(() => []);
  return { pages, pagesRead, totalPages, images, truncated: truncated || pagesRead < totalPages,
    visualLimited: validPages.length > images.length || (visual && !requestedPages.length && totalPages > images.length) };
}

extract().then(result => parentPort.postMessage(result), () => parentPort.postMessage(null));
