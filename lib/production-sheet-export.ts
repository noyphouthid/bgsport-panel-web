const SHEET_RENDER_WIDTH_PX = 760;
const A4_MARGIN_MM = 8;
const IMAGE_WAIT_TIMEOUT_MS = 30_000;

// A broken image must not block printing, so errors and slow images both resolve.
export async function waitForSheetAssets(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img")).filter((image) => !image.complete);
  const imagesSettled = Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, IMAGE_WAIT_TIMEOUT_MS));
  await Promise.race([Promise.all([imagesSettled, document.fonts.ready]), timeout]);
}

export function buildProductionSheetPdfFileName(code: string) {
  const safeCode = code.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safeCode || "production-order"}.pdf`;
}

function buildUniquePdfFileName(code: string, usedNames: Set<string>) {
  const baseName = buildProductionSheetPdfFileName(code);
  let name = baseName;
  for (let copy = 2; usedNames.has(name); copy += 1) {
    name = baseName.replace(/\.pdf$/, `-${copy}.pdf`);
  }
  usedNames.add(name);
  return name;
}

// A row taller than a whole page can still outgrow its sheet, so capture the full height and fit it on the A4 page.
async function renderPageAsJpeg(sheet: HTMLElement) {
  const { toJpeg } = await import("html-to-image");
  const width = SHEET_RENDER_WIDTH_PX;
  const height = Math.max(Math.ceil((width * 297) / 210), sheet.scrollHeight);

  // Capture the inner page so the on-screen sheet border stays out of the document.
  const page = sheet.firstElementChild instanceof HTMLElement ? sheet.firstElementChild : sheet;
  const dataUrl = await toJpeg(page, {
    cacheBust: true,
    includeQueryParams: true,
    backgroundColor: "#ffffff",
    quality: 0.95,
    pixelRatio: 3,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
    },
  });

  return { dataUrl, width, height };
}

// Continuation pages of one order go into the same PDF, one A4 page each.
async function renderSheetAsA4Pdf(pages: HTMLElement[]) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  for (const [index, page] of pages.entries()) {
    const { dataUrl, width, height } = await renderPageAsJpeg(page);
    if (index > 0) pdf.addPage("a4", "p");
    const scale = Math.min((pageWidth - A4_MARGIN_MM * 2) / width, (pageHeight - A4_MARGIN_MM * 2) / height);
    const imageWidth = width * scale;
    pdf.addImage(dataUrl, "JPEG", (pageWidth - imageWidth) / 2, A4_MARGIN_MM, imageWidth, height * scale);
  }
  return pdf;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type SheetPdfEntry = { pages: HTMLElement[]; code: string };

// One sheet downloads as a PDF. Several become one ZIP, because browsers block bursts of downloads.
export async function downloadSheetsAsPdf(entries: SheetPdfEntry[], onProgress?: (done: number) => void) {
  if (entries.length === 1) {
    const pdf = await renderSheetAsA4Pdf(entries[0].pages);
    pdf.save(buildProductionSheetPdfFileName(entries[0].code));
    return;
  }

  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const pdf = await renderSheetAsA4Pdf(entry.pages);
    files[buildUniquePdfFileName(entry.code, usedNames)] = new Uint8Array(pdf.output("arraybuffer"));
    onProgress?.(index + 1);
  }
  // PDFs hold JPEG data already, so storing them uncompressed keeps the ZIP step fast.
  const zipped = zipSync(files, { level: 0 });
  saveBlob(new Blob([zipped.slice().buffer], { type: "application/zip" }), `production-orders-${new Date().toLocaleDateString("en-CA")}.zip`);
}
