const fs = require("node:fs");
const path = require("node:path");

const GRAPH_TITLE = "CONTRIBUIÇÕES";
const GRAPH_USERNAME = "blightghp";
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const outputPath = path.resolve(__dirname, "../assets/activity_flow.svg");

function contributionWindow(now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

function normalizeContributionDays(calendar) {
  if (!calendar || !Array.isArray(calendar.weeks)) {
    throw new Error("GitHub returned an invalid contribution calendar");
  }

  const days = calendar.weeks
    .flatMap((week) => week?.contributionDays ?? [])
    .map((day) => ({ date: day?.date, count: day?.contributionCount }))
    .sort((left, right) => left.date?.localeCompare(right.date));

  if (days.length === 0 || days.length > 371) {
    throw new Error(`GitHub returned an invalid number of contribution days: ${days.length}`);
  }

  const seen = new Set();
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      throw new Error("GitHub returned an invalid contribution date");
    }
    if (!Number.isSafeInteger(day.count) || day.count < 0) {
      throw new Error("GitHub returned an invalid contribution count");
    }
    if (seen.has(day.date)) {
      throw new Error(`GitHub returned duplicate contribution date ${day.date}`);
    }
    seen.add(day.date);
  }

  return days;
}

async function fetchContributionCalendar({
  token,
  username = GRAPH_USERNAME,
  now = new Date(),
  fetchImpl = fetch,
}) {
  if (!token) throw new Error("GITHUB_TOKEN is required to query GitHub GraphQL");
  const { from, to } = contributionWindow(now);
  const query = `
    query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays { date contributionCount }
            }
          }
        }
      }
    }
  `;

  let lastFailure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "blightghp-profile-workflow",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ query, variables: { login: username, from, to } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`GitHub GraphQL returned HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload.errors?.length) {
        throw new Error(`GitHub GraphQL failed: ${payload.errors[0].message}`);
      }
      const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
      const days = normalizeContributionDays(calendar);
      return { days, total: days.reduce((sum, day) => sum + day.count, 0) };
    } catch (error) {
      lastFailure = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastFailure;
}

function renderContributionGraph({ days, total }) {
  const normalized = normalizeContributionDays({
    weeks: [{ contributionDays: days.map(({ date, count }) => ({
      date,
      contributionCount: count,
    })) }],
  });
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Contribution total must be a non-negative safe integer");
  }

  const width = 1200;
  const height = 300;
  const margin = { top: 62, right: 28, bottom: 42, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(1, ...normalized.map((day) => day.count));
  const x = (index) => margin.left + (index * plotWidth) / Math.max(1, normalized.length - 1);
  const y = (count) => margin.top + plotHeight - (count * plotHeight) / maximum;
  const points = normalized.map((day, index) => `${x(index).toFixed(2)},${y(day.count).toFixed(2)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${x(normalized.length - 1).toFixed(2)},${(
    margin.top + plotHeight
  ).toFixed(2)} L ${margin.left},${margin.top + plotHeight} Z`;
  const activePoints = normalized
    .map((day, index) => day.count > 0
      ? `<circle class="activity-point" cx="${x(index).toFixed(2)}" cy="${y(day.count).toFixed(2)}" r="2.6" />`
      : "")
    .join("");
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const gridY = margin.top + plotHeight * ratio;
      const value = Math.round(maximum * (1 - ratio));
      return `<line x1="${margin.left}" y1="${gridY.toFixed(2)}" x2="${width - margin.right}" y2="${gridY.toFixed(2)}" /><text x="${margin.left - 10}" y="${(gridY + 4).toFixed(2)}" text-anchor="end">${value}</text>`;
    })
    .join("");
  const firstDate = normalized[0].date;
  const lastDate = normalized.at(-1).date;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="graph-title graph-desc">
  <title id="graph-title">${GRAPH_TITLE}</title>
  <desc id="graph-desc">${total} contribuições públicas de ${GRAPH_USERNAME} entre ${firstDate} e ${lastDate}.</desc>
  <style>
    :root { color-scheme: dark light; }
    .title { fill:#58a6ff; font:600 18px "Segoe UI",sans-serif; letter-spacing:.08em }
    .summary,.date { fill:#8b949e; font:12px "Segoe UI",sans-serif }
    .grid line { stroke:#30363d; stroke-width:1; opacity:.55 }
    .grid text { fill:#8b949e; font:10px "Segoe UI",sans-serif }
    .activity-area { fill:#2389ff; opacity:.16 }
    .activity-line { fill:none; stroke:#2389ff; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:30 8; animation:signal-flow 2.8s linear infinite; filter:url(#signal-glow) }
    .activity-point { fill:#b8e3ff; animation:node-pulse 2.2s ease-in-out infinite }
    @keyframes signal-flow { to { stroke-dashoffset:-68 } }
    @keyframes node-pulse { 0%,100% { opacity:.45 } 50% { opacity:1 } }
    @media (prefers-color-scheme: light) {
      .summary,.date,.grid text { fill:#355b7e }
      .grid line { stroke:#d0d7de }
    }
    @media (prefers-reduced-motion: reduce) {
      .activity-line,.activity-point { animation:none }
    }
  </style>
  <defs>
    <filter id="signal-glow" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="1.6" result="blur" />
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <text class="title" x="${width / 2}" y="27" text-anchor="middle">${GRAPH_TITLE}</text>
  <text class="summary" x="${width / 2}" y="47" text-anchor="middle">${total} no período · máximo diário ${maximum}</text>
  <g class="grid">${grid}</g>
  <path class="activity-area" d="${areaPath}" />
  <path class="activity-line" d="${linePath}" />
  <g>${activePoints}</g>
  <text class="date" x="${margin.left}" y="${height - 14}">${firstDate}</text>
  <text class="date" x="${width - margin.right}" y="${height - 14}" text-anchor="end">${lastDate}</text>
</svg>
`;
}

async function updateGraph() {
  const graph = await fetchContributionCalendar({ token: process.env.GITHUB_TOKEN });
  const svg = renderContributionGraph(graph);
  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(`updated ${outputPath} with ${graph.total} contributions`);
}

module.exports = {
  GRAPH_TITLE,
  GRAPH_USERNAME,
  contributionWindow,
  fetchContributionCalendar,
  normalizeContributionDays,
  renderContributionGraph,
};

if (require.main === module) {
  updateGraph().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
