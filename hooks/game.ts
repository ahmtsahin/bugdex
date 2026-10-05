import type { Battle, Kind, Profile } from '../types'
import { SPECIES } from './species'

// Pure rules of the game: what a command is, what its output says, and how a
// battle moves. No `$` in here, so every rule is testable on its own.

const TEST =
  /\b(jest|vitest|mocha|ava|pytest|phpunit|rspec|playwright\s+test|cypress\s+run)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(go|cargo|dotnet|deno)\s+test\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\bmvnw?\b[^|;&]*\btest\b|\bgradlew?\b[^|;&]*\btest\b|\bnode\b[^|;&]*\s--test\b|--test-enable\b|\bmake\s+test\b/i
const LINT =
  /\b(eslint|ruff|flake8|pylint|stylelint|golangci-lint|clippy)\b|\bbiome\s+(check|lint)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?lint\b/i
const BUILD =
  /\b(tsc|mypy|pyright)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?(build|typecheck|type-check)\b|\bcargo\s+(build|check)\b|\bgo\s+(build|vet)\b/i
const GIT = /\bgit\s+(merge|rebase|pull|cherry-pick|commit)\b/i
const CONFLICT = /CONFLICT \(|Automatic merge failed|^<<<<<<< /m

export function kindOf(command: string): Kind | null {
  if (TEST.test(command)) return 'test'
  if (LINT.test(command)) return 'lint'
  if (BUILD.test(command)) return 'build'
  if (GIT.test(command)) return 'git'
  return null
}

const FAILED = [
  // node --test: "# fail 2" (TAP) or "ℹ fail 2" (spec)
  /^[^\w\n]*fail\s+(\d+)\s*$/m,
  /(\d+)\s+failed\b/i,
  /(\d+)\s+failing\b/i,
  /failures=(\d+)/i,
  /errors=(\d+)/i,
  /Found\s+(\d+)\s+errors?/i,
  /(\d+)\s+errors?\b/i,
  /(\d+)\s+problems?\b/i,
]

export function countFailed(text: string): number | null {
  for (const pattern of FAILED) {
    const found = pattern.exec(text)
    const count = found ? Number(found[1]) : 0
    if (count > 0) return count
  }
  const goFailures = text.match(/^--- FAIL/gm)?.length ?? 0
  return goFailures > 0 ? goFailures : null
}

export function countPassed(text: string): number | null {
  const found = /(\d+)\s+(passed|passing)\b/i.exec(text) ?? /^[^\w\n]*pass\s+(\d+)\s*$/m.exec(text)
  return found ? Number(found[1]) : null
}

export function classify(text: string, kind: Kind): string {
  const hit = SPECIES.find(one => one.match?.test(text))
  if (hit) return hit.id
  if (kind === 'lint') return 'lintworm'
  if (kind === 'build') return 'compilisk'
  if (kind === 'git') return 'conflux'
  return 'assertoad'
}

export type Run = {
  kind: Kind
  isFailing: boolean
  hasErrored: boolean
  failed: number
  passed: number | null
  speciesId: string
}

export function readRun(command: string, text: string, hasErrored: boolean): Run | null {
  const kind = kindOf(command)
  if (kind === null) return null
  const parsed = countFailed(text)
  const isFailing = kind === 'git' ? CONFLICT.test(text) : hasErrored || (parsed ?? 0) > 0
  return {
    kind,
    isFailing,
    hasErrored,
    failed: isFailing ? Math.max(1, kind === 'git' ? (text.match(/CONFLICT \(/g)?.length ?? 1) : (parsed ?? 1)) : 0,
    passed: countPassed(text),
    speciesId: classify(text, kind),
  }
}

export const enemyLevel = (failed: number): number => Math.min(99, 4 + failed * 3)

export function startBattle(run: Run): Battle {
  return {
    kind: run.kind,
    speciesId: run.speciesId,
    level: enemyLevel(run.failed),
    hp: run.failed,
    maxHp: run.failed,
    runs: 1,
    edits: {},
    totalEdits: 0,
    touchedTests: false,
    isConfused: false,
  }
}

export const CONFUSED_AFTER = 3

export type Step =
  | { type: 'none' }
  | { type: 'appeared'; battle: Battle }
  | { type: 'hit'; battle: Battle; before: number; isProgress: boolean }
  | { type: 'won'; battle: Battle; speciesId: string; isCaught: boolean; isFlaky: boolean; xp: number }

export function onRun(battle: Battle | null, run: Run): Step {
  if (battle === null) {
    return run.isFailing ? { type: 'appeared', battle: startBattle(run) } : { type: 'none' }
  }
  // A lint pass says nothing about a failing test suite, and so on.
  if (run.kind !== battle.kind) return { type: 'none' }

  if (run.isFailing) {
    const isProgress = run.failed < battle.hp
    const mostEdits = Math.max(0, ...Object.values(battle.edits))
    return {
      type: 'hit',
      before: battle.hp,
      isProgress,
      battle: {
        ...battle,
        hp: run.failed,
        maxHp: Math.max(battle.maxHp, run.failed),
        level: Math.max(battle.level, enemyLevel(run.failed)),
        runs: battle.runs + 1,
        edits: isProgress ? {} : battle.edits,
        isConfused: !isProgress && mostEdits >= CONFUSED_AFTER,
      },
    }
  }

  // A clean exit is needed to win: `git commit` with nothing to commit is no victory.
  if (run.hasErrored) return { type: 'none' }

  // Red, then green, with nothing changed in between: the test was flaky.
  const isFlaky = battle.totalEdits === 0
  // Caught only when a test was written or changed during the fight, and the
  // suite was red before it went green.
  const isCaught = !isFlaky && battle.touchedTests
  return {
    type: 'won',
    battle,
    speciesId: isFlaky ? 'flakeling' : battle.speciesId,
    isCaught,
    isFlaky,
    xp: winXp(battle, isCaught, isFlaky),
  }
}

const TEST_PATH =
  /(^|[\\/])(tests?|__tests__|specs?)[\\/]|[._-](test|spec)\.[a-z0-9]+$|(^|[\\/])test_[^\\/]+\.py$|_test\.(go|py)$/i

export const isTestPath = (path: string): boolean => TEST_PATH.test(path)

export function onEdit(battle: Battle, path: string): Battle {
  return {
    ...battle,
    edits: { ...battle.edits, [path]: (battle.edits[path] ?? 0) + 1 },
    totalEdits: battle.totalEdits + 1,
    touchedTests: battle.touchedTests || isTestPath(path),
  }
}

export function winXp(battle: Battle, isCaught: boolean, isFlaky: boolean): number {
  if (isFlaky) return 10
  return 30 + 15 * battle.maxHp + (isCaught ? 25 : 0)
}

export const MAX_LEVEL = 100

export const xpForLevel = (level: number): number => 40 * (level - 1) ** 2

export const levelOf = (xp: number): number => Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1)

export const EMPTY_PROFILE: Profile = { xp: 0, wins: 0, caught: {}, seen: {} }

const counts = (value: unknown): Record<string, number> => {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) out[key] = Math.floor(count)
  }
  return out
}

export function readProfile(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) return EMPTY_PROFILE
  const value = raw as Record<string, unknown>
  const number = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)
  return { xp: number(value.xp), wins: number(value.wins), caught: counts(value.caught), seen: counts(value.seen) }
}

export const withSeen = (profile: Profile, speciesId: string): Profile => ({
  ...profile,
  seen: { ...profile.seen, [speciesId]: (profile.seen[speciesId] ?? 0) + 1 },
})

export function withWin(profile: Profile, speciesId: string, isCaught: boolean, xp: number): Profile {
  return {
    ...profile,
    xp: profile.xp + xp,
    wins: profile.wins + 1,
    seen: profile.seen[speciesId] ? profile.seen : { ...profile.seen, [speciesId]: 1 },
    caught: isCaught ? { ...profile.caught, [speciesId]: (profile.caught[speciesId] ?? 0) + 1 } : profile.caught,
  }
}

export function filledOf(fraction: number, width: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * width)
}

export function bar(fraction: number, width: number): string {
  const filled = filledOf(fraction, width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function hpColor(fraction: number): string {
  if (fraction > 0.5) return '#48c050'
  if (fraction > 0.2) return '#f8b830'
  return '#f05030'
}

export const freeContext = (percentUsed: number | undefined): number | null =>
  percentUsed === undefined ? null : Math.max(0, Math.min(100, 100 - percentUsed))

export function labelFor(tool: string, input: unknown): string {
  const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const text =
    typeof value.command === 'string'
      ? value.command
      : typeof value.file_path === 'string'
        ? value.file_path.split(/[\\/]/).pop() ?? value.file_path
        : typeof value.url === 'string'
          ? value.url
          : tool
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? `${line.slice(0, 57)}...` : line
}
