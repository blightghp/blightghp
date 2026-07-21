const fs = require("node:fs");
const path = require("node:path");

const url = new URL("https://github-readme-activity-graph.vercel.app/graph");
url.search = new URLSearchParams({
  username: "blightghp",
  bg_color: "transparent",
  color: "58a6ff",
  line: "2389ff",
  point: "b8e3ff",
  area: "true",
  hide_border: "true",
  custom_title: "Signals over time",
}).toString();

const outputPath = path.resolve(__dirname, "../assets/activity_flow.svg");

async function updateGraph() {
  const response = await fetch(url, {
    headers: { "user-agent": "blightghp-profile-workflow" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`activity graph returned HTTP ${response.status}`);

  let svg = await response.text();
  if (!/<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new Error("activity graph response is not a complete SVG");
  }

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
    </style>`;

  svg = svg.replace(/<svg([^>]*)>/i, `<svg$1>${definitions}`);
  svg = svg.replace(/<\/svg>\s*$/i, `${animation}</svg>`);
  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(`updated ${outputPath}`);
}

updateGraph().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
