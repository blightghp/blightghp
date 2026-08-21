import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const markdownFiles = execFileSync(
  "rg",
  ["--files", "-g", "*.md", "-g", "!node_modules/**", "-g", "!target/**"],
  { cwd: projectRoot, encoding: "utf8" },
)
  .split(/\r?\n/u)
  .filter(Boolean);

const unexpectedRootDocs = markdownFiles.filter(
  (file) => path.dirname(file) === "." && file !== "README.md",
);
const errors = unexpectedRootDocs.map(
  (file) => `${file}: documento solto na raiz; mova-o para docs/`,
);

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
