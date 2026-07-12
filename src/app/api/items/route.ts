import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  topic: z.string().trim().min(2).max(100),
  existing: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
  count: z.number().int().min(1).max(5).optional(),
});

const demos: Record<string, string[]> = {
  "potato dishes": [
    "French fries", "Tater tots", "Mashed potatoes", "Hash browns", "Potato gratin",
    "Baked potato", "Potato salad", "Gnocchi", "Rösti", "Potato wedges",
    "Potato skins", "Hasselback potatoes", "Latkes", "Patatas bravas", "Duchess potatoes",
    "Colcannon", "Pommes Anna", "Aloo tikki", "Potato croquettes", "Home fries",
  ],
};

function uniqueAdditions(items: unknown[], existing: string[], limit: number) {
  const seen = new Set(existing.map((item) => item.trim().toLocaleLowerCase()));
  const additions: string[] = [];
  for (const value of items) {
    if (typeof value !== "string") continue;
    const item = value.trim();
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    additions.push(item);
    if (additions.length === limit) break;
  }
  return additions;
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid topic and contender list." }, { status: 400 });

  const { topic, existing, count } = parsed.data;
  const requestedCount = existing.length ? (count ?? 5) : Math.min(count ?? 30, 30);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const curated = demos[topic.toLocaleLowerCase()] ?? [];
    const fallback = Array.from({ length: existing.length + 35 }, (_, i) => `${topic} pick ${i + 1}`);
    const candidates = [...curated, ...fallback];
    const mockCount = existing.length ? requestedCount : Math.min(10, requestedCount);
    return NextResponse.json({ items: uniqueAdditions(candidates, existing, mockCount), mock: true });
  }

  const prompt = existing.length
    ? `Return JSON only: {"items":[...]}. Think of exactly ${requestedCount} additional concrete, rankable items for ${JSON.stringify(topic)}. They must not duplicate or merely rename any existing item: ${JSON.stringify(existing)}.`
    : `Return JSON only: {"items":[...]}. Propose a reasonable number of unique, concrete, rankable items for ${JSON.stringify(topic)}. Maximum 30.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
  });
  if (!response.ok) return NextResponse.json({ error: "Gemini could not build this list." }, { status: 502 });
  const json = await response.json();
  const data = JSON.parse(json.candidates[0].content.parts[0].text);
  return NextResponse.json({ items: uniqueAdditions(data.items ?? [], existing, requestedCount) });
}
