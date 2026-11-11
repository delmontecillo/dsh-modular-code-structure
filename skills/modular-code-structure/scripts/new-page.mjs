#!/usr/bin/env node
// new-page.mjs — scaffold one page folder with its frontend/ and backend/ sides.
//
// Usage: node new-page.mjs <Name> [--pages-dir <dir>] [--sides frontend,backend]
//                           [--frontend-ext tsx] [--backend-ext ts] [--dry-run] [--help]
//
// Creates <pages-dir>/<Name>/page.json plus a minimal entry stub on each side, picking
// TypeScript/JSX/Vue/Svelte from the project; other stacks come from the extension flags.

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function usageError(message) {
  console.error(`new-page: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { sides: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--pages-dir') { out.pagesDir = argv[++i]; if (!out.pagesDir) usageError('missing value for --pages-dir'); }
    else if (arg === '--sides') out.sides = argv[++i];
    else if (arg === '--frontend-ext') out.frontendExt = argv[++i]?.replace(/^\./, '');
    else if (arg === '--backend-ext') out.backendExt = argv[++i]?.replace(/^\./, '');
    else if (arg.startsWith('-')) usageError(`unknown option ${arg}`);
    else if (!out.name) out.name = arg;
    else usageError(`unexpected argument ${arg}`);
  }
  return out;
}

function toPageName(raw) {
  const words = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) usageError('page name is empty');
  const name = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) usageError(`"${raw}" cannot form a PascalCase page name`);
  return name;
}

const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function detectExtensions(root) {
  const pkg = await readJson(path.join(root, 'package.json'));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const hasTsconfig = await access(path.join(root, 'tsconfig.json')).then(() => true, () => false);
  const ts = hasTsconfig || Boolean(deps.typescript);
  const base = ts ? 'ts' : 'js';
  if (deps.vue) return { frontend: 'vue', backend: base };
  if (deps.svelte || deps['@sveltejs/kit']) return { frontend: 'svelte', backend: base };
  if (deps.react || deps.next || deps.preact || deps['solid-js']) return { frontend: ts ? 'tsx' : 'jsx', backend: base };
  return { frontend: base, backend: base };
}

function frontendStub(name, ext) {
  if (ext === 'tsx' || ext === 'jsx') {
    return `// ${name} page — frontend entry. Keep this file under 300 lines.\n\nexport default function ${name}Page() {\n  return (\n    <main>\n      <h1>${name}</h1>\n    </main>\n  );\n}\n`;
  }
  if (ext === 'vue') {
    return `<script setup>\n// ${name} page — frontend entry. Keep this file under 300 lines.\n</script>\n\n<template>\n  <main>\n    <h1>${name}</h1>\n  </main>\n</template>\n`;
  }
  if (ext === 'svelte') {
    return `<script>\n  // ${name} page — frontend entry. Keep this file under 300 lines.\n</script>\n\n<main>\n  <h1>${name}</h1>\n</main>\n`;
  }
  if (ext === 'ts') {
    return `// ${name} page — frontend entry. Keep this file under 300 lines.\n\nexport function render(root: HTMLElement): void {\n  root.textContent = '${name}';\n}\n`;
  }
  if (ext === 'js') {
    return `// ${name} page — frontend entry. Keep this file under 300 lines.\n\nexport function render(root) {\n  root.textContent = '${name}';\n}\n`;
  }
  return null;
}

function backendStub(name, ext) {
  if (ext === 'ts') {
    return `// ${name} page — backend entry. Keep this file under 300 lines.\n\nexport async function handle${name}Request(input: unknown): Promise<unknown> {\n  throw new Error('handle${name}Request is not implemented');\n}\n`;
  }
  if (ext === 'js') {
    return `// ${name} page — backend entry. Keep this file under 300 lines.\n\nexport async function handle${name}Request(input) {\n  throw new Error('handle${name}Request is not implemented');\n}\n`;
  }
  if (ext === 'py') {
    return `"""${name} page — backend entry. Keep this file under 300 lines."""\n\n\ndef handle_${snake(name)}_request(input: dict) -> dict:\n    raise NotImplementedError\n`;
  }
  return null;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    console.log('new-page <Name> [--pages-dir src/pages] [--sides frontend,backend]');
    console.log('          [--frontend-ext tsx] [--backend-ext ts] [--dry-run]');
    console.log('Creates the page folder, page.json, and one entry stub per side.');
    return;
  }
  if (!cli.name) usageError('a page name is required, e.g. new-page Checkout');

  const root = process.cwd();
  const name = toPageName(cli.name);
  const config = await readJson(path.join(root, '.modular-code.json'));
  const pagesDir = path.resolve(root, cli.pagesDir ?? config?.pagesDir ?? 'src/pages');
  const detected = await detectExtensions(root);
  const sides = (cli.sides ?? 'frontend,backend').split(',').map((side) => side.trim()).filter(Boolean);
  if (!sides.length) usageError('--sides needs at least one folder name');
  if (sides.some((side) => /[\\/]/.test(side))) usageError('side names cannot contain path separators');

  const extensions = {
    frontend: cli.frontendExt ?? detected.frontend,
    backend: cli.backendExt ?? detected.backend,
  };

  let existing = [];
  try {
    existing = await readdir(pagesDir);
  } catch {
    // pages root is created below
  }
  const clash = existing.find((entry) => entry.toLowerCase() === name.toLowerCase() && entry !== name);
  if (clash) usageError(`"${name}" collides with existing folder "${clash}" on case-insensitive filesystems`);

  const pageDir = path.join(pagesDir, name);
  const plan = [{ file: path.join(pageDir, 'page.json'), content: `${JSON.stringify({ sides }, null, 2)}\n` }];

  for (const side of sides) {
    if (side !== 'frontend' && side !== 'backend') {
      plan.push({
        file: path.join(pageDir, side, 'README.md'),
        content: `# ${side}\n\nNo starter file was generated for the "${side}" side of ${name}. Follow the project convention.\n`,
      });
      continue;
    }
    const ext = extensions[side];
    const stub = side === 'frontend' ? frontendStub(name, ext) : backendStub(name, ext);
    if (stub) {
      plan.push({ file: path.join(pageDir, side, `index.${ext}`), content: stub });
    } else {
      plan.push({
        file: path.join(pageDir, side, 'README.md'),
        content: `# ${side}\n\nNo starter file exists for .${ext} here. Add the ${name} ${side} entry using the project's convention.\n`,
      });
    }
  }

  for (const item of plan) {
    const rel = path.relative(root, item.file).split(path.sep).join('/');
    if (cli.dryRun) {
      console.log(`would create ${rel}`);
      continue;
    }
    await mkdir(path.dirname(item.file), { recursive: true });
    try {
      await writeFile(item.file, item.content, { flag: 'wx' });
      console.log(`created ${rel}`);
    } catch (error) {
      if (error.code === 'EEXIST') console.log(`kept    ${rel} (already exists)`);
      else throw error;
    }
  }

  if (!cli.dryRun) {
    console.log(`\n${name}: ${sides.join(' + ')} under ${pagesDir}`);
    console.log('Next: rename index.* to the framework route convention, wire the two sides,');
    console.log('then run the modular-code-structure checker and fix every finding.');
  }
}

await main().catch((error) => {
  console.error(error);
  process.exit(2);
});
