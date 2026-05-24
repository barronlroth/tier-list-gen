import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CodexGeneratedImage } from "@/lib/codex-app-server";

const DATA_DIR = process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data");
const ASSET_DIR = path.join(DATA_DIR, "assets");

export type SavedAsset = {
  assetId: string;
  imageUrl: string;
};

export async function saveGeneratedImageAsset(
  image: CodexGeneratedImage,
): Promise<SavedAsset> {
  await mkdir(ASSET_DIR, { recursive: true });

  if (image.savedPath) {
    const extension = extensionFromPath(image.savedPath);
    const assetId = `asset_${randomUUID()}${extension}`;
    await copyFile(image.savedPath, assetPath(assetId));
    return { assetId, imageUrl: `/api/assets/${assetId}` };
  }

  const parsed = parseImageData(image.result);
  const assetId = `asset_${randomUUID()}${parsed.extension}`;
  await writeFile(assetPath(assetId), parsed.buffer);
  return { assetId, imageUrl: `/api/assets/${assetId}` };
}

export async function readImageAsset(assetId: string) {
  if (!isSafeAssetId(assetId)) {
    return null;
  }
  const filePath = assetPath(assetId);
  try {
    const [buffer, stats] = await Promise.all([readFile(filePath), stat(filePath)]);
    return {
      buffer,
      contentLength: stats.size,
      contentType: contentTypeFromAssetId(assetId),
    };
  } catch {
    return null;
  }
}

function parseImageData(result: string) {
  const dataUrlMatch = result.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const contentType = dataUrlMatch?.[1] ?? "image/png";
  const base64 = dataUrlMatch?.[2] ?? result;
  return {
    buffer: Buffer.from(base64, "base64"),
    extension: extensionFromContentType(contentType),
  };
}

function assetPath(assetId: string) {
  return path.join(ASSET_DIR, assetId);
}

function isSafeAssetId(assetId: string) {
  return /^asset_[a-f0-9-]+\.(png|jpg|jpeg|webp)$/i.test(assetId);
}

function extensionFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return extension;
  }
  return ".png";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "image/jpeg") {
    return ".jpg";
  }
  if (contentType === "image/webp") {
    return ".webp";
  }
  return ".png";
}

function contentTypeFromAssetId(assetId: string) {
  const extension = path.extname(assetId).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}
