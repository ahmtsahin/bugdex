import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput } from 'claude-code'

import type { Battle, Profile } from '../types'
import {
  EMPTY_PROFILE,
  bar,
  filledOf,
  freeContext,
  hpColor,
  labelFor,
  levelOf,
  onEdit,
  onRun,
  readProfile,
  readRun,
  withSeen,
  withWin,
  xpForLevel,
} from './game'
import { spriteCells, spriteSvg, unknownSvg } from './raster'
import type { Canvas } from './raster'
import { BY_NUMBER, SPECIES, mascotFor, speciesById } from './species'
import type { Sprite } from './species'

const PANE = 'bugdex'
const BATTLE_PANE = 'bugdex-battle'
const MASCOT_COLOR = '#3fbfa8'
const TRACK_COLOR = '#808080'
// CSS pixels per sprite pixel where a surface draws SVG.
const CARD_PIXEL = 5
const BATTLE_PIXEL = 6
// Every Bugdex card draws its picture in a box this size, so names line up.
const CARD: Canvas = { columns: 16, rows: 12 }

const battleAtom = atom({ plugin: 'bugdex', key: 'battle' } as const, null)
const encounterAtom = atom({ plugin: 'bugdex', key: 'encounter' } as const, null)
const hpAtom = atom({ plugin: 'bugdex', key: 'hp' } as const, null)
const PROFILE = { plugin: 'bugdex', key: 'profile' } as const
const profileAtom = atom(PROFILE, EMPTY_PROFILE)
const messageAtom = atom({ plugin: 'bugdex', key: 'message' } as const, null)
const BAND_HIDDEN = { plugin: 'bugdex', key: 'isBandHidden' } as const
const hiddenAtom = atom(BAND_HIDDEN, false)

type Dollar = EngineInterface

const nameOf = (speciesId: string): string => speciesById(speciesId)?.name ?? 'Bug'

// $.state is the session's, and /clear starts a new session with no session.start,
// so what this session never held comes from $.store, where the progress lives.
async function profileNow($: Dollar): Promise<Profile> {
  const { value } = await $.state.get(PROFILE)
  return value ?? readProfile(await $.store.get('profile'))
}

async function isBandHiddenNow($: Dollar): Promise<boolean> {
  const { value } = await $.state.get(BAND_HIDDEN)
  return value ?? (await $.store.get('bandHidden')) === true
}

// On the terminal a bar is one glyph per cell. The other surfaces set text in a
// proportional font where a full block runs wider than a cell, so a full bar
// spilled out of its card; there it is laid out as boxes, which keep to their cells.
function meter($: Dollar, e: ResolveInput, fraction: number, width: number, color: string) {
  const { Box, Text } = $.ui.resolve(e)
  if (e.surface === 'terminal') {
    return (
      <Text color={color} wrap="truncate">
        {bar(fraction, width)}
      </Text>
    )
  }
  return (
    <Box flexDirection="row" width={width} height={1}>
      <Box width={filledOf(fraction, width)} backgroundColor={color} />
      <Box flexGrow={1} backgroundColor={TRACK_COLOR} />
    </Box>
  )
}

// A sprite as the surface draws it: half blocks on the terminal, SVG on the
// desktop, the editor and the phone.
function picture(
  $: Dollar,
  e: ResolveInput,
  key: string,
  sprite: Sprite,
  alt: string,
  look: { isSilhouette?: boolean; canvas?: Canvas; scale?: number } = {},
) {
  if (e.surface === 'terminal') {
    const { Box, Raster } = $.ui.resolve(e)
    const packed = spriteCells(sprite, look.isSilhouette)
    const raster = <Raster key={key} columns={packed.columns} rows={packed.rows} cells={packed.cells} />
    if (look.canvas === undefined) return raster
    // The canvas in cells, the sprite at its bottom center, as spriteSvg places it.
    return (
      <Box width={look.canvas.columns} height={Math.ceil(look.canvas.rows / 2)} flexDirection="column" justifyContent="flex-end" alignItems="center">
        {raster}
      </Box>
    )
  }
  const { Svg } = $.ui.resolve(e)
  const drawn = spriteSvg(sprite, look.isSilhouette, look.canvas)
  const scale = look.scale ?? CARD_PIXEL
  return <Svg key={key} source={drawn.source} alt={alt} width={drawn.columns * scale} height={drawn.rows * scale} />
}

async function say($: Dollar, text: string | null) {
  await update($, messageAtom, () => text)
}

// Read, change and write the profile in one go, so two sessions on this
// machine lose as little as possible when they finish a fight at once.
async function changeProfile($: Dollar, change: (profile: Profile) => Profile) {
  const before = readProfile(await $.store.get('profile'))
  const after = change(before)
  await $.store.set('profile', after)
  await update($, profileAtom, () => after)
  return { before, after }
}

async function onShell($: Dollar, command: string, text: string, hasErrored: boolean) {
  const run = readRun(command, text, hasErrored)
  if (run === null) return
  const step = onRun(await read($, battleAtom), run)

  if (step.type === 'appeared') {
    await update($, battleAtom, () => step.battle)
    await changeProfile($, profile => withSeen(profile, step.battle.speciesId))
    const failing = step.battle.hp === 1 ? '1 failing' : `${step.battle.hp} failing`
    await say($, `A wild ${nameOf(step.battle.speciesId)} appeared! (${failing})`)
    if (!(await isBandHiddenNow($))) {
      // Opened unasked, the pane needs a wide terminal; the band's Battle button opens it at any width.
      const opened = await $.ui.open({ id: BATTLE_PANE, title: 'Battle' })
      if (!opened.isPlaced) $.ui.toast(`A wild ${nameOf(step.battle.speciesId)} appeared! Press Battle to watch the fight.`)
    }
    return
  }

  if (step.type === 'hit') {
    await update($, battleAtom, () => step.battle)
    const enemy = nameOf(step.battle.speciesId)
    const mascot = mascotFor(levelOf((await profileNow($)).xp)).name
    if (step.battle.isConfused) {
      await say($, `${mascot} is confused! Same file edited 3+ times with no progress. Maybe step in.`)
    } else if (step.isProgress) {
      await say($, `It's effective! ${enemy} drops from ${step.before} to ${step.battle.hp}.`)
    } else {
      await say($, `${enemy} shrugged it off. ${step.battle.hp} still failing.`)
    }
    return
  }

  if (step.type === 'won') {
    await update($, battleAtom, () => null)
    const { before, after } = await changeProfile($, profile =>
      withWin(profile, step.speciesId, step.isCaught, step.xp),
    )
    const enemy = nameOf(step.speciesId)
    const lines = [
      step.isFlaky
        ? `It was a ${enemy} all along: green with nothing changed. +${step.xp} XP`
        : `${nameOf(step.battle.speciesId)} fainted! +${step.xp} XP`,
    ]
    if (step.isCaught) lines.push(`${enemy} was caught in a test tube!`)
    const [was, now] = [levelOf(before.xp), levelOf(after.xp)]
    if (now > was) {
      const [oldForm, newForm] = [mascotFor(was).name, mascotFor(now).name]
      lines.push(oldForm === newForm ? `${newForm} grew to Lv${now}!` : `What? ${oldForm} evolved into ${newForm}!`)
    }
    await say($, lines.join(' '))
    $.ui.toast(lines.join('\n'))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const profile = readProfile(await $.store.get('profile'))
    await update($, profileAtom, () => profile)
    const isHidden = (await $.store.get('bandHidden')) === true
    await update($, hiddenAtom, () => isHidden)
    try {
      const usage = await $.session.usage()
      await update($, hpAtom, () => freeContext(usage.context.percent))
    } catch {
      // No reading yet; the first measurement fills it in.
    }
    try {
      await $.command.register({
        name: 'bugdex',
        description: 'Open your Bugdex, or turn the battle band on and off',
        argumentHint: '[battle|band on|band off]',
      })
    } catch {
      // A name already taken; the band still works.
    }
    return next(e)
  })

  on('command.run', { command: 'bugdex' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'band off' || args === 'band on') {
      const isHidden = args === 'band off'
      await $.store.set('bandHidden', isHidden)
      await update($, hiddenAtom, () => isHidden)
      return { text: isHidden ? 'Bugdex band hidden. `/bugdex band on` brings it back.' : 'Bugdex band is back.' }
    }
    if (args === 'battle') {
      await $.ui.open({ id: BATTLE_PANE, title: 'Battle' })
      return {}
    }
    await $.ui.open({ id: PANE, title: 'Bugdex' })
    return {}
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await update($, hpAtom, () => freeContext(e.context.percent))
    return next(e)
  })

  // A permission prompt is a wild encounter. Display only: the decision stays
  // with the person and the engine's own dialog.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    try {
      if (verdict.decision === 'ask' && e.tool_use_id !== undefined) {
        const encounter = { toolUseId: e.tool_use_id, tool: e.tool, label: labelFor(e.tool, e.input) }
        await update($, encounterAtom, () => encounter)
      }
    } catch {
      // The game never stands in the way of a decision.
    }
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const encounter = await read($, encounterAtom)
      if (encounter !== null && encounter.toolUseId === e.tool_use_id) {
        await update($, encounterAtom, () => null)
        const hasFled =
          ran.deny !== undefined || (ran.isError === true && /reject|denied|declin|doesn't want|did not allow/i.test(ran.text ?? ''))
        await say($, hasFled ? `The wild ${encounter.tool} fled. (denied)` : `You let the wild ${encounter.tool} through. (approved)`)
      }
      if (ran.deny !== undefined) return ran

      if (e.tool === 'Bash' || e.tool === 'PowerShell') {
        const result = ran.result as { interrupted?: boolean; backgroundTaskId?: string } | undefined
        if (!result?.interrupted && result?.backgroundTaskId === undefined) {
          await onShell($, e.command, ran.text ?? '', ran.isError === true)
        }
      } else if ((e.tool === 'Edit' || e.tool === 'Write') && ran.isError !== true) {
        const path = e.file_path
        await update($, battleAtom, (battle: Battle | null) => (battle === null ? null : onEdit(battle, path)))
      }
    } catch {
      // Whatever the game makes of it, the tool's result goes back untouched.
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await update($, encounterAtom, () => null)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if ((await read($, battleAtom)) === null) {
      await say($, null)
      // The fight is over and the result has been read: the battle pane goes.
      await $.ui.close({ id: BATTLE_PANE })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    if (e.props.hasSurvey || (await isBandHiddenNow($))) return beneath

    const { Box, Text, Button } = $.ui.resolve(e)
    const [battle, encounter, hp, profile, message] = await Promise.all([
      read($, battleAtom),
      read($, encounterAtom),
      read($, hpAtom),
      profileNow($),
      read($, messageAtom),
    ])
    const level = levelOf(profile.xp)
    const mascot = mascotFor(level).name
    const hpFraction = hp === null ? 1 : hp / 100
    const me = (
      <Text wrap="truncate">
        <Text color={MASCOT_COLOR} bold>
          {mascot}
        </Text>
        <Text dimColor> Lv{level} </Text>
        <Text color={hpColor(hpFraction)}>{bar(hpFraction, 10)}</Text>
        <Text dimColor> {hp === null ? '--' : `${hp}%`}</Text>
        {battle?.isConfused ? <Text color="#c050c0"> Confused</Text> : ''}
      </Text>
    )

    let top
    if (encounter !== null) {
      top = (
        <Text wrap="truncate">
          <Text color="#e8833a" bold>
            A wild {encounter.tool} appeared!
          </Text>
          <Text> {encounter.label}</Text>
          <Text dimColor> Approve to let it through, deny and it flees.</Text>
        </Text>
      )
    } else if (battle !== null) {
      const species = speciesById(battle.speciesId)
      const fraction = battle.maxHp === 0 ? 0 : battle.hp / battle.maxHp
      top = (
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate">
            <Text dimColor>Wild </Text>
            <Text color={species?.color ?? '#e06050'} bold>
              {species?.name ?? 'Bug'}
            </Text>
            <Text dimColor> Lv{battle.level} </Text>
            <Text color={hpColor(fraction)}>{bar(fraction, 10)}</Text>
            <Text dimColor>
              {' '}
              {battle.hp}/{battle.maxHp} failing
            </Text>
          </Text>
          {me}
        </Box>
      )
    } else {
      const caught = SPECIES.filter(one => (profile.caught[one.id] ?? 0) > 0).length
      top = (
        <Box flexDirection="row" justifyContent="space-between">
          {me}
          <Text dimColor wrap="truncate">
            XP {profile.xp}/{xpForLevel(level + 1)} · Bugdex {caught}/{SPECIES.length}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {top}
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor wrap="truncate">
            {message ?? (battle === null ? 'All quiet. Failing tests will show up here.' : '')}
          </Text>
          <Box flexDirection="row" gap={1}>
            {battle !== null ? (
              <Button key="bugdex-battle" label="Battle" plain dimColor onPress={() => $.ui.open({ id: BATTLE_PANE, title: 'Battle' })} />
            ) : (
              ''
            )}
            <Button key="bugdex-open" label="Bugdex" plain dimColor onPress={() => $.ui.open({ id: PANE, title: 'Bugdex' })} />
            <Button
              key="bugdex-hide"
              label="Hide"
              plain
              dimColor
              onPress={async () => {
                await $.store.set('bandHidden', true)
                await update($, hiddenAtom, () => true)
                $.ui.toast('Bugdex band hidden. /bugdex band on brings it back.')
              }}
            />
          </Box>
        </Box>
        {beneath}
      </Box>
    )
  })

  // The fight drawn whole: the bug top right with its card, your creature
  // bottom left with its own, and the message box underneath.
  on('ui.render', { component: 'Pane', requestId: BATTLE_PANE }, async ($, e) => {
    const [battle, hp, profile, message] = await Promise.all([
      read($, battleAtom),
      read($, hpAtom),
      profileNow($),
      read($, messageAtom),
    ])
    const level = levelOf(profile.xp)
    const mascot = mascotFor(level)
    const species = battle === null ? undefined : speciesById(battle.speciesId)
    const toNext = xpForLevel(level + 1) - xpForLevel(level)
    const xpFraction = toNext === 0 ? 1 : (profile.xp - xpForLevel(level)) / toNext
    const hpFraction = hp === null ? 1 : hp / 100
    const cardWidth = Math.min(30, Math.max(20, e.props.bodyColumns - 18))
    const barWidth = cardWidth - 8

    const { Box, Text, Button } = $.ui.resolve(e)

    let foe
    if (battle !== null) {
      const fraction = battle.maxHp === 0 ? 0 : battle.hp / battle.maxHp
      foe = (
        <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start">
          <Box flexDirection="column" borderStyle="round" paddingX={1} width={cardWidth}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold color={species?.color} wrap="truncate">
                {species?.name ?? 'Bug'}
              </Text>
              <Text>Lv{battle.level}</Text>
            </Box>
            <Text dimColor wrap="truncate">
              Type: {species?.type ?? 'Bug'}
            </Text>
            <Box flexDirection="row" gap={1}>
              <Text bold color="#f8b830">
                HP
              </Text>
              {meter($, e, fraction, barWidth, hpColor(fraction))}
            </Box>
            <Text dimColor>
              {battle.hp}/{battle.maxHp} failing
            </Text>
          </Box>
          {species === undefined ? '' : picture($, e, `foe-${species.id}`, species, species.name, { scale: BATTLE_PIXEL })}
        </Box>
      )
    } else {
      foe = (
        <Box height={e.surface === 'terminal' ? 6 : 1} alignItems="center" justifyContent="center">
          <Text dimColor>No wild bugs around.</Text>
        </Box>
      )
    }

    const me = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
        {picture($, e, 'mascot', mascot, mascot.name, { scale: BATTLE_PIXEL })}
        <Box flexDirection="column" borderStyle="round" paddingX={1} width={cardWidth}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color={MASCOT_COLOR}>
              {mascot.name}
            </Text>
            <Text>Lv{level}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text bold color="#f8b830">
              HP
            </Text>
            {meter($, e, hpFraction, barWidth, hpColor(hpFraction))}
          </Box>
          <Text dimColor>free context {hp === null ? '--' : `${hp}%`}</Text>
          {meter($, e, xpFraction, barWidth + 3, '#40a8f8')}
        </Box>
      </Box>
    )

    const lines =
      battle === null
        ? [message ?? 'All quiet. Failing tests will show up here.']
        : battle.isConfused
          ? [message ?? `${mascot.name} is confused!`, 'Maybe step in.']
          : [message ?? `A wild ${species?.name ?? 'Bug'} appeared!`, 'What will Claude do?']

    return (
      <Box flexDirection="column" gap={1}>
        {foe}
        {me}
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="#e06050" paddingX={1}>
            {lines.map((line, i) => (
              <Text key={`line-${i}`}>{line}</Text>
            ))}
          </Box>
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Button key="battle-dex" label="Bugdex" plain onPress={() => $.ui.open({ id: PANE, title: 'Bugdex' })} />
            <Button key="battle-hide" label="Hide" plain onPress={() => $.ui.close({ id: BATTLE_PANE })} />
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const profile = await profileNow($)
    const level = levelOf(profile.xp)
    const mascot = mascotFor(level)
    const caught = SPECIES.filter(one => (profile.caught[one.id] ?? 0) > 0).length
    const seen = SPECIES.filter(one => (profile.seen[one.id] ?? 0) > 0 || (profile.caught[one.id] ?? 0) > 0).length
    const toNext = xpForLevel(level + 1) - xpForLevel(level)
    const inLevel = profile.xp - xpForLevel(level)
    const width = Math.max(20, e.props.bodyColumns)
    const perRow = Math.max(1, Math.floor((width + 2) / 20))

    const { Box, Text } = $.ui.resolve(e)
    const unknown = (key: string) => {
      if (e.surface === 'terminal') {
        return (
          <Box key={key} width={CARD.columns} height={Math.ceil(CARD.rows / 2)} alignItems="center" justifyContent="center">
            <Text dimColor>?</Text>
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      const drawn = unknownSvg(CARD)
      return <Svg key={key} source={drawn.source} alt="Unknown species" width={drawn.columns * CARD_PIXEL} height={drawn.rows * CARD_PIXEL} />
    }

    const cards = BY_NUMBER.map(species => {
      const caughtCount = profile.caught[species.id] ?? 0
      const isSeen = caughtCount > 0 || (profile.seen[species.id] ?? 0) > 0
      const no = `#${String(species.no).padStart(3, '0')}`
      return (
        <Box key={`card-${species.id}`} flexDirection="column" width={18}>
          {isSeen
            ? picture($, e, `sprite-${species.id}`, species, species.name, { isSilhouette: caughtCount === 0, canvas: CARD })
            : unknown(`unknown-${species.id}`)}
          <Text wrap="truncate" bold={caughtCount > 0} color={caughtCount > 0 ? species.color : undefined} dimColor={caughtCount === 0}>
            {no} {isSeen ? species.name : '???'}
          </Text>
          <Text dimColor wrap="truncate">
            {caughtCount > 0 ? `${species.type} ×${caughtCount}` : isSeen ? 'Seen, not caught' : ' '}
          </Text>
        </Box>
      )
    })
    const rows = []
    for (let i = 0; i < cards.length; i += perRow) {
      rows.push(
        <Box key={`row-${i}`} flexDirection="row" gap={2} marginBottom={1}>
          {cards.slice(i, i + perRow)}
        </Box>,
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} marginBottom={1}>
          {picture($, e, 'mascot', mascot, mascot.name)}
          <Box flexDirection="column">
            <Text color={MASCOT_COLOR} bold>
              {mascot.name} Lv{level}
            </Text>
            <Box flexDirection="row" gap={1}>
              {meter($, e, toNext === 0 ? 1 : inLevel / toNext, 16, '#40a8f8')}
              <Text dimColor>{profile.xp} XP</Text>
            </Box>
            <Text dimColor>
              Wins {profile.wins} · Caught {caught}/{SPECIES.length} · Seen {seen}/{SPECIES.length}
            </Text>
            <Text dimColor>Catch a bug: write or fix a test while it's failing, then go green.</Text>
          </Box>
        </Box>
        {rows}
      </Box>
    )
  })
}
