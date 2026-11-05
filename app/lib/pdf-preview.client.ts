let workerConfigured = false;

async function configurePdfWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

export async function renderPdfPageDataUrls(
  data: Uint8Array,
  options: { maxWidth: number; maxPages?: number },
): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  await configurePdfWorker(pdfjs);

  const pdf = await pdfjs.getDocument({ data }).promise;
  const maxPages = options.maxPages ?? pdf.numPages;
  const urls: string[] = [];
  const renderWidth = Math.max(80, options.maxWidth);

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;

    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    await page.render({ canvasContext: context, viewport: scaledViewport, canvas }).promise;
    urls.push(canvas.toDataURL("image/png"));
  }

  return urls;
}
