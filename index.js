import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Skill provider for `modular-code-structure`.
 *
 * The skill body lives next to this plugin as a normal `SKILL.md`, so the file a
 * model reads is the file a person edits. The body is re-read on every lookup:
 * no cache to invalidate while tuning the instructions. The body's `<skill-dir>`
 * resolves to this skill directory, which carries the two helper scripts.
 *
 * @module dsh-modular-code-structure
 */

const PROVIDER = 'modular-code-structure'
const SKILL_BODY_URL = new URL('./skills/modular-code-structure/SKILL.md', import.meta.url)
const SKILL_PATH = fileURLToPath(SKILL_BODY_URL)
const SKILL_DIR = dirname(SKILL_PATH)
// Bundled-skill rank. Outranks user and project skill roots so this provider
// wins a name collision, and matches BUNDLED_SKILL_RANK from @deepseek-ai/dsh-skill.
const RANK = 600
const FALLBACK_DESCRIPTION =
  'Structure app code as one folder per page, each with frontend/ and backend/ subfolders, and keep every source file at or under 300 lines (400 hard cap).'

const RESOURCE_BASE = { kind: 'directory', path: SKILL_DIR }

/** Split leading YAML frontmatter into scalar fields plus the remaining body. */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text)
  if (match === null) return { data: {}, body: text }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    if (quoted) value = value.slice(1, -1)
    data[key] = value
  }
  return { data, body: text.slice(match[0].length) }
}

async function readSkill() {
  const raw = await readFile(SKILL_BODY_URL, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  return {
    name: typeof data.name === 'string' && data.name !== '' ? data.name : 'modular-code-structure',
    description: typeof data.description === 'string' && data.description !== ''
      ? data.description
      : FALLBACK_DESCRIPTION,
    whenToUse: typeof data.whenToUse === 'string' && data.whenToUse !== '' ? data.whenToUse : undefined,
    invocation: { modelInvocable: true, userInvocable: true },
    body: body.replace(/^\s*\n/, ''),
  }
}

const provider = {
  name: PROVIDER,
  async list() {
    const skill = await readSkill()
    return [{
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      invocation: skill.invocation,
      provider: PROVIDER,
      source: 'bundled',
      rank: RANK,
      resourceBase: RESOURCE_BASE,
      path: SKILL_PATH,
      locator: SKILL_BODY_URL,
    }]
  },
  async get() {
    const skill = await readSkill()
    return {
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      invocation: skill.invocation,
      provider: PROVIDER,
      source: 'bundled',
      resourceBase: RESOURCE_BASE,
      path: SKILL_PATH,
      content: skill.body,
    }
  },
}

/** Cordis plugin name. */
export const name = 'modular-code-structure'
/** Service required by the provider. */
export const inject = ['skills']

/** Register the bundled `modular-code-structure` provider on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
