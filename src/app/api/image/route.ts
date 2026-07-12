import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  topic: z.string().max(100),
  item: z.string().max(100),
  style: z.string().max(300),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid item" }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const label = encodeURIComponent(parsed.data.item);
    return NextResponse.json({ url: `https://placehold.co/640x480/ede8da/171717?text=${label}`, mock: true });
  }

  const prompt = `Create one clean square ranking-card image of ${parsed.data.item}, for a ${parsed.data.topic} tier list. Coherent art direction: ${parsed.data.style}. No text.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
    signal: req.signal,
  });
  if (!response.ok) return NextResponse.json({ error: "Image failed" }, { status: 502 });
  const json = await response.json();
  const part = json.candidates[0].content.parts.find((value: { inlineData?: unknown }) => value.inlineData);
  return NextResponse.json({ url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
}
