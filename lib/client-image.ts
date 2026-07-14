"use client";

export type ResizedImageResult = {
  file: File;
  width: number;
  height: number;
  mimeType: string;
};

function loadImageDimensions(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to read image: ${file.name}`));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to convert image"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function normalizeOutputType(type: string) {
  if (type === "image/png" || type === "image/webp" || type === "image/jpeg") return type;
  return "image/jpeg";
}

function replaceFileExtension(fileName: string, mimeType: string) {
  const extensionByMimeType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByMimeType[mimeType] || "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}.${extension}`;
}

export async function resizeImageFileToFit(file: File, maxWidth: number, maxHeight: number): Promise<ResizedImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const image = await loadImageDimensions(file);
  const outputType = normalizeOutputType(file.type);
  const widthRatio = maxWidth / image.width;
  const heightRatio = maxHeight / image.height;
  const scale = Math.min(1, widthRatio, heightRatio);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image resize canvas");
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, outputType, outputType === "image/png" ? undefined : 0.92);
  const resizedFile = new File([blob], replaceFileExtension(file.name, outputType), {
    type: outputType,
    lastModified: file.lastModified,
  });

  return {
    file: resizedFile,
    width,
    height,
    mimeType: outputType,
  };
}
