import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const ignoredDirectories = new Set([".git", "dist", "node_modules", "target"]);

function collectMarkdownFiles(directory, relativeDirectory = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...collectMarkdownFiles(path.join(directory, entry.name), relativePath));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath.replaceAll("\\", "/"));
    }
  }
  return files;
}

const markdownFiles = collectMarkdownFiles(projectRoot).sort();
const allowedRootMarkdown = new Set(["AGENTS.md", "README.md"]);

const unexpectedRootDocs = markdownFiles.filter(
  (file) => path.dirname(file) === "." && !allowedRootMarkdown.has(file),
);
const errors = unexpectedRootDocs.map(
  (file) => `${file}: documento solto na raiz; mova-o para docs/`,
);

const canonicalRoadmap = "docs/planning/ROADMAP.md";
const competingRoadmaps = markdownFiles.filter(
  (file) =>
    path.basename(file).toUpperCase().includes("ROADMAP") &&
    file !== canonicalRoadmap &&
    !file.startsWith("docs/legacy/"),
);
for (const file of competingRoadmaps) {
  errors.push(
    `${file}: roadmap concorrente; mantenha somente ${canonicalRoadmap} e reclassifique o arquivo como plano ou backlog`,
  );
}

if (!markdownFiles.includes(canonicalRoadmap)) {
  errors.push(`${canonicalRoadmap}: roadmap canônico ausente`);
}

let checkedLinks = 0;

function lineNumber(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function validateTarget(file, content, target, offset) {
  const unwrapped = target.startsWith("<") && target.endsWith(">")
    ? target.slice(1, -1)
    : target;

  if (!unwrapped || /^(?:[a-z][a-z\d+.-]*:|#|\/)/iu.test(unwrapped)) return;

  const pathname = unwrapped.split(/[?#]/u, 1)[0];
  if (!pathname) return;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    errors.push(`${file}:${lineNumber(content, offset)}: caminho inválido: ${target}`);
    return;
  }

  checkedLinks += 1;
  const resolved = path.resolve(projectRoot, path.dirname(file), decodedPath);
  if (!existsSync(resolved)) {
    errors.push(`${file}:${lineNumber(content, offset)}: destino ausente: ${target}`);
  }
}

for (const file of markdownFiles) {
  const content = readFileSync(path.join(projectRoot, file), "utf8");
  const patterns = [
    /\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/gu,
    /(?:href|src)=["']([^"']+)["']/giu,
    /^\s*\[[^\]]+\]:\s*(\S+)/gmu,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      validateTarget(file, content, match[1], match.index ?? 0);
    }
  }
}

if (errors.length > 0) {
  console.error(`documentação inválida (${errors.length} problema(s)):\n${errors.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`documentação verificada: ${markdownFiles.length} arquivos, ${checkedLinks} links locais`);
}
