---
name: modular-code-structure
description: Structure app code as one folder per page, each with frontend/ and backend/ subfolders, and keep every source file at or under 300 lines (400 hard cap). Use when adding a page or screen, starting an app, splitting a file that grew too large, or when the user asks for "modular structure", "page folders", a "frontend/backend split", or a 300/400-line limit.
whenToUse: "modular code structure; page folders; frontend backend split; split this file; files over 300 lines; new page scaffold; page layout"
---

# Modular Code Structure

A page is the unit of ownership: everything it needs lives under its own folder, split
once into `frontend/` and `backend/`. Folder boundaries keep pages independent; the line
budget keeps each file readable. Apply both together — folders without a line budget
become dumping grounds, and small files without folders become a flat pile.

This skill is for **applications with pages/screens**. For a pure library, keep the feature
folders but skip `frontend/` and `backend/`.

The runtime prints this skill's base directory when it loads; `<skill-dir>` below means that
path. Scripts need Node 18+ and have no dependencies.

## The page contract

```text
<project>/
  shared/                  # code used by 2+ pages
    contracts/             # request/response types + validation, one source of truth
    frontend/              # design system, formatters, browser helpers
    backend/               # db client, auth guard, logging, mail
  pages/                   # src/pages, app/, routes/ — whichever the stack uses
    Home/
      page.json            # optional: {"sides": ["frontend"], "rootFiles": ["page.tsx"]}
      frontend/            # every file that renders or drives Home
      backend/             # every file that serves Home
    Checkout/
      frontend/
      backend/
```

Five rules, in priority order:

1. **One page, one PascalCase folder.** `Home`, `Checkout`, `UserProfile`. The folder name
   does not dictate the URL: routes stay whatever the framework already uses
   (`/checkout`, `/user-profile`).
2. **Two sides by default.** Every page starts with `frontend/` and `backend/`. If a page
   genuinely has no server side or no UI, declare that in its `page.json` `sides` instead of
   leaving a mystery gap. A side that exists is a directory, never a single file.
3. **Page root holds only the sides.** No loose `.tsx`, `.py`, or `.css` at `Home/`. The page
   root is a boundary marker, not a dumping ground. `page.json`, `README.md`, and any files
   listed in `page.json` `rootFiles` (a framework's route file) are the only exceptions.
4. **Pages never import pages.** Dependencies point `page → shared`; `shared` never imports
   a page. When two pages need the same code, promote it to `shared/` at the second use —
   not the first.
5. **300 is the working number; 400 is the ceiling.** Every source file is written to stay
   at or under 300 lines. Up to 400 passes the checker but is a warning: treat it as
   transient work-in-progress and split in the same change. Over 400 fails.

Generated and vendored code (`*.gen.ts`, `dist/`, `node_modules/`) is exempt. The checker
already skips common build and vendor folders; add project-specific generated paths to
`.modular-code.json` `ignore` instead of editing the checker.

## The line budget

| Lines | State | Action |
| --- | --- | --- |
| ≤ 300 | healthy | none |
| 301–400 | over target | split before you call the work done, or name the seam and schedule it now |
| > 400 | violation | the checker fails; stop and split |

Counting is physical lines of the whole file — blank lines, comments, and imports included.
Do not game it by minifying, joining statements, or deleting the comment that explains the
file. A file that is small because it is unreadable is not modular.

**Split by responsibility, never by line count.** `part1.ts` / `part2.ts` at line 300 is a
rename, not a split. Split when you can name what the new file owns.

Extraction order that keeps diffs reviewable:

1. constants and fixtures;
2. types and the request/response contract (goes to `shared/contracts/` if both sides use it);
3. pure helpers and formatting;
4. data access and side effects;
5. UI pieces (components, hooks) or handlers (controllers, services);
6. leave the original file as the public entry that composes the pieces.

## What belongs on each side

| `frontend/` | `backend/` |
| --- | --- |
| route/page entry and components | request handler / route adapter |
| styling and assets | input validation |
| client state and hooks | business rules |
| calls to this page's endpoints | persistence and transactions |
| display formatting | response shaping, logging, errors |

Rules that follow from the split:

- The frontend never touches a database, reads a secret, or owns a rule the backend must
  also enforce. It may duplicate a *check for UX*; the authoritative check stays server-side.
- The backend never renders. No JSX, no DOM, no component imports.
- Shared request/response types and validation schemas live in `shared/contracts/` and are
  imported by both sides — do not hand-copy a shape into both folders.

## Workflow

1. **Detect the stack before writing files.** Check for `package.json` + `tsconfig.json`
   (TypeScript), `pyproject.toml` (Python), `go.mod` (Go), `composer.json` (PHP), `Gemfile`
   (Ruby), `*.csproj` (.NET). Follow the existing framework's routing and test conventions;
   this skill governs folder boundaries and file size, not framework choice. If the project
   is empty and no stack is stated, ask once — do not guess in a way that is expensive to undo.
2. **Find the pages root.** Use an existing `pages/`, `src/pages/`, `app/`, or `routes/`.
   Default to `src/pages` and record it in `.modular-code.json` so the checker and every
   future agent agree.
3. **Scaffold the page folder** rather than creating files ad hoc:
   ```sh
   node "<skill-dir>/scripts/new-page.mjs" Checkout --pages-dir src/pages
   ```
   Rename the stubs to the framework's convention (e.g. `page.tsx`, `route.ts`) and delete
   nothing from the two-side layout.
4. **Write the contract first.** Shape the request/response in `shared/contracts/`, then the
   backend that satisfies it, then the frontend that consumes it. This ordering prevents the
   frontend from inventing fields the backend cannot produce.
5. **Write small from the start.** Start a new file when you can name its job; do not write
   500 lines and split afterwards. If a file must be edited and already exceeds 300 lines,
   split it as part of the edit — never leave it larger than you found it.
6. **Verify before reporting done.**
   ```sh
   node "<skill-dir>/scripts/check-structure.mjs" . --pages-dir src/pages
   ```
   Fix every error and either fix or explicitly schedule each warning. Paste the summary in
   your final message: pages found, files split, and the checker's error/warning counts.

## Splitting a file that crossed the line

1. Read the whole file and list its responsibilities, one line each.
2. Group the list by job: fetch, validate, transform, render, persist, orchestrate.
3. Create one sibling per group, named for the job (`useQuoteForm.ts`, `quote.service.ts`,
   `quote.schema.ts`) — no `utils2`, no `helpers-old`.
4. Move code without rewriting it. One commit moves, the next commit changes behavior.
5. Leave the original as the composition entry, re-exporting what callers already import.
6. Re-run the build/tests and the checker.

If a group is still over 300 lines, you have not found its seam yet; split the group by the
next responsibility down, not by character count.

## Migrating an existing app

- Move files with `git mv` and update imports in the same commit, so history follows.
- Never combine a move with a rewrite; a review must be able to see that code is unchanged.
- Keep URLs and public entry points stable; change imports, not routes.
- Migrate one page at a time and keep the build green between pages.
- Do not create a `misc/`, `common/`, or `utils/` page to absorb leftovers. Leftovers belong
  to a real page or to `shared/`; if they belong to nothing, delete them.

## Framework adaptations

The contract bends where the framework owns the file path, never where it owns the logic:

- **Next.js App Router / Remix routes:** keep the framework's `page.tsx`/`route.ts` as a thin
  adapter (imports and wiring only) and put the real UI in `frontend/`, server actions and
  loaders in `backend/`, all beside the route file.
- **SvelteKit / Nuxt:** the `+page.svelte` / `page.vue` file stays where routing requires;
  components and logic live in the sibling `frontend/` and `backend/`.
- **MVC backends (Rails, Laravel, Django):** views and assets go in `frontend/`, controllers,
  services, and queries in `backend/`; the framework's own layout stays where it is.
- **API-only apps:** keep the page's generated client in `frontend/` when there is one; a
  page with no client at all declares `{"sides": ["backend"]}`.

## Configuration

Put `.modular-code.json` at the project root. CLI flags override it.

```json
{
  "pagesDir": "src/pages",
  "target": 300,
  "max": 400,
  "sides": ["frontend", "backend"],
  "ignore": ["**/*.gen.ts", "**/generated/**"]
}
```

Lowering `target` or `max` for a stricter codebase is fine. Raising either one above the
skill's defaults requires the user's explicit agreement — the budget is the point.

## Anti-patterns

| Symptom | Fix |
| --- | --- |
| `Home/Home.tsx` at the page root | move it into `Home/frontend/` |
| `Home/frontend/utils.ts` at 900 lines | split by responsibility; promote cross-page parts to `shared/` |
| `Checkout/frontend/Cart.tsx` imports `../../Home/...` | move the shared piece to `shared/`; invert the dependency |
| Backend file exports a React component | it belongs in `frontend/` |
| One `page.json` says `["frontend"]` but a backend exists | declare what exists; the checker warns on undeclared sides |
| A 398-line file left "because it passes" | find the seam now; the next feature will break it |
| `part1.ts` + `part2.ts` split at the limit | rename by responsibility or revert the split |
| A `shared/` folder that imports a page | dependency is backwards; move the page-specific piece back |
| A new page created by copying another page | copy the folder skeleton, not the code; duplicated logic goes to `shared/` |

## Definition of done

- [ ] every page folder is PascalCase and contains exactly its sides — both by default, or what its `page.json` declares;
- [ ] no source file exceeds 400 lines, and none over 300 is left without a named seam;
- [ ] no page imports another page; shared code lives in `shared/`;
- [ ] the frontend has no server-only code and the backend renders nothing;
- [ ] `check-structure.mjs` exits 0 (or only warnings you have reported to the user);
- [ ] the app still builds and its tests pass.

## Never

- create pages outside the pages root — no top-level `Home/` next to `src/pages/`;
- put shared code in the first page that needs it "for now";
- satisfy the line budget by deleting tests, comments, error handling, or blank lines;
- raise `max` to make the checker pass;
- rename a page folder to fix lint while breaking the route that referenced it.
