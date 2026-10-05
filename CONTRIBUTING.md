# Contributing to Bugdex

Thanks for helping! A few rules keep the project healthy and safe to share.

## Original work only

Every creature, name, sprite, sound and font in Bugdex must be original or under a license that allows it, stated in the pull request.

- No characters, names, sprites or sounds taken from existing games, shows or brands, and no "fan art" of them.
- No company logos or mascots.
- If you base a sprite on a reference, say what it is; we may ask you to change it.

Pull requests that break this rule are closed.

## Adding a species

1. Add an entry to `SPECIES` in `hooks/species.ts`: a unique `id`, the next `no`, a `name`, a `type`, a hex `color`, and a `match` regex for the output that should summon it. Order matters: the first match wins.
2. Draw the sprite as rows of palette letters, `.` for transparent. Keep every row the same width (16 at most) and the number of rows even: two pixel rows become one terminal row.
3. Add a case to `hooks/game.test.ts` that shows real runner output summoning the species.
4. Add the species to the table in `README.md`.

## Supporting another runner

Command detection and failure counting live in `hooks/game.ts` (`kindOf`, `countFailed`). Add the pattern and a test with the runner's real output.

## Ground rules for the mod itself

- Bugdex never changes a tool call, a tool result, a prompt or a permission decision. It only watches and draws.
- No network requests and no model calls without an explicit opt-in setting, documented in the README.
- Hooks must never throw into the engine's path: wrap game logic so the tool result always goes back untouched.

## Before you open a pull request

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

Both must pass.
