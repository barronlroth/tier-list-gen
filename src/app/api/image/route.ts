import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  topic: z.string().max(100),
  item: z.string().max(100),
  style: z.string().max(300),
});

const IMAGE_MODEL = "gemini-3.1-flash-lite-image";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid item" }, { status: 400 });

  const key = process.env.TIERLISTGEN_FORCE_MOCK ? undefined : process.env.GEMINI_API_KEY;
  if (!key) {
    const label = parsed.data.item.replace(/[<>&]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#ede8da"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#171717">${label}</text></svg>`;
    return NextResponse.json({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mock: true });
  }

  const prompt = `Create one clean square ranking-card image of ${parsed.data.item}, for a ${parsed.data.topic} tier list. Coherent art direction: ${parsed.data.style}. No text.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    }),
    signal: req.signal,
  });
  if (!response.ok) return NextResponse.json({ error: "Image failed" }, { status: 502 });
  const json = await response.json();
  const part = json.candidates[0].content.parts.find((value: { inlineData?: unknown }) => value.inlineData);
  return NextResponse.json({ url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
}
