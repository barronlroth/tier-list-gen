export async function GET(
  _request: Request,
  { params }: { params: Promise<{ title: string }> },
) {
  const { title } = await params;
  const label = decodeURIComponent(title).slice(0, 34);
  const hue = hash(label) % 360;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 48%, 78%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 42) % 360}, 52%, 54%)"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="382" cy="120" r="96" fill="rgba(255,255,255,0.25)"/>
  <rect x="72" y="292" width="368" height="86" rx="18" fill="rgba(255,255,255,0.72)"/>
  <text x="256" y="344" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#181714">${escapeXml(label)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function hash(input: string) {
  return [...input].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function escapeXml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

