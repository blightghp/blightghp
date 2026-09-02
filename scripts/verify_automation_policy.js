import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDirectory = path.join(repositoryRoot, ".github", "workflows");
const writerWorkflows = new Set(["sync-brain-gif.yml", "update-graph.yml"]);

function fail(errors, file, message) {
  errors.push(`${path.relative(repositoryRoot, file)}: ${message}`);
}

function extractJobs(source) {
  const lines = source.split(/\r?\n/);
  const jobs = [];
  let inJobs = false;
  let current;
  for (const line of lines) {
    if (line === "jobs:") {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const heading = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
    if (heading) {
      current = { name: heading[1], lines: [] };
      jobs.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return jobs;
}

function verifyWorkflow(file, errors) {
  const source = fs.readFileSync(file, "utf8");
  const name = path.basename(file);
  if (!/^permissions:\r?\n/m.test(source)) {
    fail(errors, file, "must declare explicit top-level permissions");
  }
  if (/pull_request_target\s*:/.test(source)) {
    fail(errors, file, "pull_request_target is forbidden");
  }
  if (/\$\{\{\s*github\.event\./.test(source)) {
    fail(errors, file, "event payload interpolation is forbidden in workflow source");
  }

  const uses = [...source.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+)(?:\s+#\s*(.+))?$/gm)];
  for (const match of uses) {
    if (!/^[0-9a-f]{40}$/.test(match[2])) {
      fail(errors, file, `${match[1]} must be pinned to a full 40-character commit SHA`);
    }
    if (!match[3]) {
      fail(errors, file, `${match[1]} must retain a human-readable release comment`);
    }
  }

  const checkoutBlocks = source.split(/uses:\s*actions\/checkout@[0-9a-f]{40}[^\n]*\n/).slice(1);
  for (const block of checkoutBlocks) {
    const localBlock = block.split(/^\s*-\s+name:/m, 1)[0];
    if (!/persist-credentials:\s*false/.test(localBlock)) {
      fail(errors, file, "every checkout must disable persisted credentials");
    }
  }

  const jobs = extractJobs(source);
  if (jobs.length === 0) fail(errors, file, "must define at least one job");
  for (const job of jobs) {
    if (!job.lines.some((line) => /^    timeout-minutes:\s*\d+/.test(line))) {
      fail(errors, file, `job ${job.name} must declare timeout-minutes`);
    }
  }

  const writePermissionCount = (source.match(/contents:\s*write/g) ?? []).length;
  if (writerWorkflows.has(name)) {
    if (!/group:\s*profile-writers-main/.test(source)) {
      fail(errors, file, "profile writers must share the profile-writers-main lock");
    }
    if (!/cancel-in-progress:\s*false/.test(source)) {
      fail(errors, file, "profile writers must finish instead of being cancelled mid-write");
    }
    if (writePermissionCount !== 1 || !/^permissions:\r?\n  contents:\s*read/m.test(source)) {
      fail(errors, file, "contents: write must be narrowed to exactly one job");
    }
    if ((source.match(/pull-requests:\s*write/g) ?? []).length !== 1) {
      fail(errors, file, "pull-requests: write must be narrowed to exactly one job");
    }
    if ((source.match(/actions:\s*write/g) ?? []).length !== 1) {
      fail(errors, file, "actions: write must be narrowed to exactly one job");
    }
    if (!/GH_TOKEN:\s*\$\{\{ github\.token \}\}/.test(source)) {
      fail(errors, file, "write token must be exposed only in the final authenticated step");
    }
    if (!/gh pr (?:create|list)/.test(source) || !/gh workflow run ci\.yml/.test(source)) {
      fail(errors, file, "profile writers must create or update a PR and dispatch CI for its head commit");
    }
    if (/git push origin HEAD:main/.test(source)) {
      fail(errors, file, "profile writers must never push directly to main");
    }
    if (/gh pr (?:review|merge)|--approve/.test(source)) {
      fail(errors, file, "profile writers must not approve or merge pull requests");
    }
  } else if (writePermissionCount > 0) {
    fail(errors, file, "only approved profile writers may request contents: write");
  }
}

function verifyDependabot(errors) {
  const file = path.join(repositoryRoot, ".github", "dependabot.yml");
  const source = fs.readFileSync(file, "utf8");
  const entries = source
    .split(/^  - package-ecosystem:\s*/m)
    .slice(1)
    .map((entry) => `package-ecosystem: ${entry}`);
  const requiredEntries = [
    ['package-ecosystem: "npm"', 'directory: "/"'],
    ['package-ecosystem: "cargo"', 'directory: "/"'],
    ['package-ecosystem: "cargo"', 'directory: "/engine"'],
    ['package-ecosystem: "github-actions"', 'directory: "/"'],
  ];
  for (const [ecosystem, directory] of requiredEntries) {
    if (!entries.some((entry) => entry.includes(ecosystem) && entry.includes(directory))) {
      fail(errors, file, `missing ${ecosystem} coverage for ${directory}`);
    }
  }
}

function verifyAgentInstructions(errors) {
  const requiredFiles = [
    path.join(repositoryRoot, "AGENTS.md"),
    path.join(repositoryRoot, ".github", "copilot-instructions.md"),
  ];
  for (const file of requiredFiles) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      fail(errors, file, "required agent instruction file is missing or empty");
    }
  }

  const agentsDirectory = path.join(repositoryRoot, ".github", "agents");
  const profiles = fs.existsSync(agentsDirectory)
    ? fs.readdirSync(agentsDirectory).filter((name) => name.endsWith(".agent.md"))
    : [];
  if (profiles.length < 2) {
    fail(errors, agentsDirectory, "at least two bounded custom agent profiles are required");
  }
  for (const profile of profiles) {
    const file = path.join(agentsDirectory, profile);
    const source = fs.readFileSync(file, "utf8");
    if (!/^---\r?\n[\s\S]+?\r?\n---\r?\n/.test(source)) {
      fail(errors, file, "must contain YAML frontmatter");
    }
    if (!/^description:\s*.+/m.test(source) || !/^tools:\s*\[/m.test(source)) {
      fail(errors, file, "must declare description and an explicit tools allowlist");
    }
  }
}

function verifyToolchains(errors) {
  for (const relative of ["rust-toolchain.toml", "engine/rust-toolchain.toml"]) {
    const file = path.join(repositoryRoot, relative);
    if (!/channel\s*=\s*"1\.97\.1"/.test(fs.readFileSync(file, "utf8"))) {
      fail(errors, file, "must pin Rust 1.97.1");
    }
  }
}

export function verifyAutomationPolicy() {
  const errors = [];
  const workflows = fs.readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  for (const workflow of workflows) {
    verifyWorkflow(path.join(workflowsDirectory, workflow), errors);
  }
  verifyDependabot(errors);
  verifyAgentInstructions(errors);
  verifyToolchains(errors);
  return errors;
}

const errors = verifyAutomationPolicy();
if (errors.length > 0) {
  console.error(`automation policy failed with ${errors.length} finding(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("automation policy verified");
}
