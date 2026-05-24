import { readImageAsset } from "@/lib/assets";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const asset = await readImageAsset(assetId);

  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(asset.buffer, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(asset.contentLength),
      "content-type": asset.contentType,
    },
  });
}
