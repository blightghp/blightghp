const fs = require("node:fs");
const path = require("node:path");
const GRAPH_TITLE = "CONTRIBUIÇÕES";

const url = new URL("https://github-readme-activity-graph.vercel.app/graph");
url.search = new URLSearchParams({
  username: "blightghp",
  bg_color: "transparent",
  color: "58a6ff",
  line: "2389ff",
  point: "b8e3ff",
  area: "true",
  hide_border: "true",
  custom_title: GRAPH_TITLE,
}).toString();

const outputPath = path.resolve(__dirname, "../assets/activity_flow.svg");

function sanitizeActivityGraph(svg) {
  const withoutForeignObjects = svg.replace(
    /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi,
    "",
  );
  const forbiddenPatterns = [
    /<script[\s>]/i,
    /<!doctype/i,
    /<!entity/i,
    /\son[a-z][\w:-]*\s*=/i,
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i,
    /\burl\(\s*["']?\s*(?:https?:|data:|javascript:)/i,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(withoutForeignObjects))) {
    throw new Error("activity graph contains active or external SVG content");
  }
  return withoutForeignObjects.replace(/^[ \t]+$/gm, "");
}

async function updateGraph() {
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(url, {
      headers: { "user-agent": "blightghp-profile-workflow" },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => undefined);
    if (response?.ok) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  if (!response) throw new Error("activity graph did not respond after 3 attempts");
  if (!response.ok) throw new Error(`activity graph returned HTTP ${response.status}`);

  let svg = await response.text();
  if (!/<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new Error("activity graph response is not a complete SVG");
  }
  svg = sanitizeActivityGraph(svg);

  const definitions = `
    <defs>
      <filter id="signalGlow" x="-20%" y="-40%" width="140%" height="180%">
        <feGaussianBlur stdDeviation="1.6" result="blur" />
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`;
  const animation = `
    <style>
      @keyframes signalFlow { to { stroke-dashoffset: -68; } }
      @keyframes nodePulse { 0%,100% { opacity:.45 } 50% { opacity:1 } }
      .ct-line { stroke-dasharray: 30 8 !important; animation: signalFlow 2.8s linear infinite !important; filter:url(#signalGlow) }
      .ct-area { opacity:.18 !important }
      .ct-point { animation: nodePulse 2.2s ease-in-out infinite !important }
      .ct-point:nth-of-type(3n) { animation-delay:.55s !important }
      @media (prefers-color-scheme: light) { text { fill:#355b7e !important } }
      @media (prefers-reduced-motion: reduce) {
        .ct-line, .ct-point { animation: none !important; }
      }
    </style>`;

  const accessibleText = `
    <title>${GRAPH_TITLE}</title>
    <desc>Contribuições públicas no GitHub como fluxo longitudinal de produção.</desc>
    <text x="600" y="32" text-anchor="middle" fill="#58a6ff" font-size="18" font-family="Segoe UI, sans-serif">${GRAPH_TITLE}</text>`;
  svg = svg.replace(/<svg([^>]*)>/i, `<svg$1>${accessibleText}${definitions}`);
  svg = svg.replace(/<\/svg>\s*$/i, `${animation}</svg>`);
  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(`updated ${outputPath}`);
}

module.exports = { GRAPH_TITLE, sanitizeActivityGraph };

if (require.main === module) {
  updateGraph().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
