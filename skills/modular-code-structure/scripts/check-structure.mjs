#!/usr/bin/env node
// check-structure.mjs — verify the page-folder contract and the 300/400 line budget.
//
// Usage: node check-structure.mjs [root] [--pages-dir <dir>] [--target <n>] [--max <n>]
//                                 [--json] [--strict] [--help]
//
// Reads <root>/.modular-code.json when present; CLI flags override it.
// Exit: 0 clean (or warnings only), 1 violations (or warnings with --strict), 2 usage error.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', '__pycache__', '.venv', 'venv', 'target',
  'vendor', '.idea', '.vscode', 'bin', 'obj',
]);
const SOURCE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro',
  '.py', '.go', '.php', '.rb', '.java', '.kt', '.cs', '.rs', '.dart', '.swift',
  '.ex', '.exs', '.lua', '.html', '.css', '.scss', '.sass', '.less', '.sql',
]);
const PAGE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const PAGE_ROOT_ALLOWED = new Set(['page.json', 'README.md']);

function usageError(message) {
  console.error(`check-structure: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { root: '.' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--strict') out.strict = true;
    else if (arg === '--pages-dir') { out.pagesDir = argv[++i]; if (!out.pagesDir) usageError('missing value for --pages-dir'); }
    else if (arg === '--target') out.target = Number(argv[++i]);
    else if (arg === '--max') out.max = Number(argv[++i]);
    else if (arg.startsWith('-')) usageError(`unknown option ${arg}`);
    else if (out.root === '.') out.root = arg;
    else usageError(`unexpected argument ${arg}`);
  }
  return out;
}

async function loadConfig(root) {
  try {
    return JSON.parse(await readFile(path.join(root, '.modular-code.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    usageError(`cannot read .modular-code.json: ${error.message}`);
  }
}

const posix = (p) => p.split(path.sep).join('/');
const firstSegment = (rel) => rel.split(path.sep)[0];

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
      else { out += '.*'; i++; }
    }
    else if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(char)) out += `\\${char}`;
    else out += char;
  }
  return new RegExp(`${out}$`);
}

function makeMatcher(patterns) {
  const compiled = patterns.map((glob) => ({ glob, re: globToRegExp(glob) }));
  return (rel, name) => compiled.some(({ glob, re }) => re.test(glob.includes('/') ? rel : name));
}

function countLines(text) {
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  if (text.length && text[text.length - 1] !== '\n') lines++;
  return lines;
}

async function walkSources(dir, ctx, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = posix(path.relative(ctx.pagesDir, full));
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || ctx.isIgnored(rel, entry.name)) continue;
      await walkSources(full, ctx, acc);
    } else if (entry.isFile()) {
      if (ctx.isIgnored(rel, entry.name)) continue;
      if (SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) acc.push(full);
    }
  }
}

function importSpecifiers(line) {
  if (!/\b(import|require|from)\b/.test(line)) return [];
  return [...line.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

async function analyzePage(pageDir, pageName, ctx) {
  const findings = [];
  const add = (severity, rule, message, extra = {}) =>
    findings.push({ page: pageName, severity, rule, message, ...extra });

  if (!PAGE_NAME.test(pageName)) {
    add('error', 'page-name', 'page folder names are PascalCase, e.g. Home or UserProfile');
  }

  let children;
  try {
    children = await readdir(pageDir, { withFileTypes: true });
  } catch {
    add('error', 'page-read', 'cannot read the page folder');
    return findings;
  }

  let declaration = {};
  if (children.some((e) => e.isFile() && e.name === 'page.json')) {
    try {
      declaration = JSON.parse(await readFile(path.join(pageDir, 'page.json'), 'utf8'));
    } catch (error) {
      add('error', 'page-json', `page.json is not valid JSON: ${error.message}`);
    }
    if (declaration.sides !== undefined && (!Array.isArray(declaration.sides) || declaration.sides.some((side) => typeof side !== 'string'))) {
      add('error', 'page-json', 'page.json "sides" must be an array of folder names');
      declaration = {};
    }
  }

  const expected = declaration.sides ?? ctx.sides;
  const allowedRootFiles = new Set([...PAGE_ROOT_ALLOWED, ...(Array.isArray(declaration.rootFiles) ? declaration.rootFiles : [])]);
  const actualDirs = children.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const side of expected) {
    if (!actualDirs.includes(side)) {
      add('error', 'missing-side', `missing ${side}/ (declare "sides" in page.json if the gap is intentional)`);
    }
  }
  for (const entry of children) {
    if (!entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !allowedRootFiles.has(entry.name)) {
        add('warning', 'stray-file', `${entry.name} sits at the page root — move it into frontend/ or backend/`);
      }
    } else if (!expected.includes(entry.name) && !SKIP_DIRS.has(entry.name)) {
      add('warning', 'undeclared-side', `folder ${entry.name}/ is not in "sides" — declare it or move its code`);
    }
  }

  const files = [];
  for (const side of expected) {
    if (actualDirs.includes(side)) await walkSources(path.join(pageDir, side), ctx, files);
  }

  for (const file of files) {
    const relRoot = posix(path.relative(ctx.root, file));
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      add('error', 'page-read', `cannot read ${relRoot}`);
      continue;
    }
    if (text.includes('\u0000')) continue;

    const lineCount = countLines(text);
    if (lineCount > ctx.max) {
      add('error', 'line-cap', `${relRoot} is ${lineCount} lines — over the ${ctx.max}-line cap`, { file: relRoot, lines: lineCount });
    } else if (lineCount > ctx.target) {
      add('warning', 'line-target', `${relRoot} is ${lineCount} lines — over the ${ctx.target}-line target, split it`, { file: relRoot, lines: lineCount });
    }

    const owner = firstSegment(path.relative(ctx.pagesDir, file));
    text.split('\n').forEach((line, index) => {
      for (const spec of importSpecifiers(line)) {
        let otherPage = null;
        if (spec.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), spec);
          const rel = path.relative(ctx.pagesDir, resolved);
          if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            const targetPage = firstSegment(rel);
            if (targetPage !== owner) otherPage = targetPage;
          }
        } else {
          const match = spec.match(/(?:^|\/)pages\/([^/]+)(?:\/|$)/);
          if (match && match[1] !== owner) otherPage = match[1];
        }
        if (otherPage) {
          add('error', 'cross-page-import', `${relRoot}:${index + 1} imports ${spec} — move shared code to shared/`, {
            file: relRoot,
            line: index + 1,
          });
        }
      }
    });
  }

  return findings;
}

async function run(ctx, cli) {
  let entries;
  try {
    entries = await readdir(ctx.pagesDir, { withFileTypes: true });
  } catch {
    usageError(`pages directory not found: ${ctx.pagesDir}\nPass --pages-dir <dir> (default: src/pages).`);
  }

  const pageNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && !name.startsWith('_') && !ctx.isIgnored(name, name));

  const findings = [];
  for (const name of pageNames) {
    findings.push(...await analyzePage(path.join(ctx.pagesDir, name), name, ctx));
  }

  const seen = new Map();
  for (const name of pageNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      findings.push({ page: name, severity: 'error', rule: 'name-collision', message: `collides with ${seen.get(key)} on case-insensitive filesystems` });
    } else {
      seen.set(key, name);
    }
  }

  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.length - errors;

  if (cli.json) {
    console.log(JSON.stringify({
      summary: { pages: pageNames.length, errors, warnings, target: ctx.target, max: ctx.max },
      findings,
    }, null, 2));
  } else {
    const relPages = posix(path.relative(ctx.root, ctx.pagesDir)) || '.';
    console.log(`modular-code-structure · ${pageNames.length} page(s) in ${relPages} · ${errors} error(s) · ${warnings} warning(s)`);
    console.log(`line budget: ${ctx.target} target / ${ctx.max} cap\n`);
    if (!pageNames.length) console.log(`  no page folders found in ${ctx.pagesDir}`);
    if (pageNames.length && !findings.length) console.log('  all pages conform');
    for (const name of pageNames) {
      const pageFindings = findings.filter((finding) => finding.page === name);
      if (!pageFindings.length) continue;
      console.log(`  ${name}`);
      for (const finding of pageFindings) {
        console.log(`    ${finding.severity === 'error' ? 'ERROR' : 'WARN '} ${finding.message}`);
      }
      console.log('');
    }
    if (warnings && !errors) console.log('Warnings do not fail the check; fix them before considering the work done.');
  }

  process.exit(errors > 0 || (cli.strict && warnings > 0) ? 1 : 0);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) return console.log('check-structure [root] [--pages-dir <dir>] [--target 300] [--max 400] [--json] [--strict]\nVerifies page folders, the frontend/backend split, cross-page imports, and line budgets.');

  const root = path.resolve(cli.root);
  const config = await loadConfig(root);
  const target = Number(cli.target ?? config.target ?? 300);
  const max = Number(cli.max ?? config.max ?? 400);

  if (!(target >= 1) || !(max > target)) usageError('--target must be a positive number lower than --max');
  if (config.sides !== undefined && !Array.isArray(config.sides)) usageError('"sides" in .modular-code.json must be an array');
  if (config.ignore !== undefined && !Array.isArray(config.ignore)) usageError('"ignore" in .modular-code.json must be an array of globs');

  const ctx = {
    root,
    pagesDir: path.resolve(root, cli.pagesDir ?? config.pagesDir ?? 'src/pages'),
    target,
    max,
    sides: config.sides ?? ['frontend', 'backend'],
    isIgnored: makeMatcher(config.ignore ?? []),
  };
  await run(ctx, cli);
}

await main().catch((error) => {
  console.error(error);
  process.exit(2);
});
