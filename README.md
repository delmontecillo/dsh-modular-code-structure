---
description: "Modular Code Structure as a DSH skill: one folder per page with frontend/ and backend/ inside, 300-line files, 400 hard cap."
kind: "package-bundle"
---

# dsh-modular-code-structure

A DeepSeek Harness bundle that adds the **Modular Code Structure** skill. It encodes one
layout contract for application code — a page owns a folder, the folder holds `frontend/` and
`backend/`, and no source file grows past 300 lines (400 hard cap) — plus two helper scripts
the skill runs to scaffold a page and to check an existing tree.

The skill is the point; the plugin is just how it ships. The bundle has no build step and no
dependencies, so the repository root is the package.

## Install

Local checkout, from an agent driving `plugin_manager`:

```
action: install_bundle
target: C:\Users\admin\dsh-modular-code-structure
```

Or with the CLI, then select the bundle in **Plugins**:

```sh
dsh plugin --profile web add link:C:/Users/admin/dsh-modular-code-structure
```

A web profile with HMR applies it live; a startup-only profile needs a restart.

## Use

The skill appears in the agent catalog as `modular-code-structure`; agents load it with the
`skill` tool and people can invoke `/modular-code-structure`. Both scripts run from the skill
directory the body calls `<skill-dir>`:

```sh
node "<skill-dir>/scripts/new-page.mjs" Checkout --pages-dir src/pages
node "<skill-dir>/scripts/check-structure.mjs" . --pages-dir src/pages
```

## Layout

```
dsh-modular-code-structure/
  index.js                              # registers the skill provider on ctx.skills
  cordis.patch.yml                      # inserts the plugin into the profile
  skills/modular-code-structure/
    SKILL.md                            # the instructions (frontmatter is the metadata)
    scripts/check-structure.mjs         # verifies sides, 300/400 lines, cross-page imports
    scripts/new-page.mjs                # scaffolds a page folder and its two sides
```

## Remove

```sh
dsh plugin --profile web remove dsh-modular-code-structure
```

Also deselect the bundle if it remains listed.
