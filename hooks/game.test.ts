import { describe, expect, test } from 'claude-code/testing'

import { EMPTY_PROFILE, classify, countFailed, countPassed, kindOf, levelOf, onEdit, onRun, readProfile, readRun, withWin, xpForLevel } from './game'
import { spriteCells, spriteSvg, toBase64 } from './raster'
import { SPECIES } from './species'

describe('reading commands and output', () => {
  test('knows a test, lint, build and git command when it sees one', async () => {
    expect(kindOf('npm test')).toBe('test')
    expect(kindOf('pnpm run test -- --watch=false')).toBe('test')
    expect(kindOf('python -m pytest -q')).toBe('test')
    expect(kindOf('./odoo-bin -d db -i sales --test-enable --stop-after-init')).toBe('test')
    expect(kindOf('npx eslint src')).toBe('lint')
    expect(kindOf('npx tsc --noEmit')).toBe('build')
    expect(kindOf('git rebase main')).toBe('git')
    expect(kindOf('node --test')).toBe('test')
    expect(kindOf('node --experimental-vm-modules --test src/')).toBe('test')
    expect(kindOf('ls -la')).toBe(null)
  })

  test('counts failures the way common runners print them', async () => {
    expect(countFailed('Tests:       2 failed, 10 passed, 12 total')).toBe(2)
    expect(countFailed('=== 3 failed, 41 passed in 2.1s ===')).toBe(3)
    expect(countFailed('  4 passing\n  1 failing')).toBe(1)
    expect(countFailed('FAILED (failures=2)')).toBe(2)
    expect(countFailed('--- FAIL: TestA\n--- FAIL: TestB')).toBe(2)
    expect(countFailed('# tests 3\n# pass 1\n# fail 2\n# cancelled 0')).toBe(2)
    expect(countFailed('ℹ tests 4\nℹ pass 4\nℹ fail 0')).toBe(null)
    expect(countPassed('# tests 3\n# pass 1\n# fail 2')).toBe(1)
    expect(countFailed('Tests: 0 failed, 12 passed')).toBe(null)
  })

  test('names the species from the error', async () => {
    expect(classify("TypeError: Cannot read properties of undefined (reading 'x')", 'test')).toBe('nullbat')
    expect(classify('TypeError: foo is not a function', 'test')).toBe('typhox')
    expect(classify("ModuleNotFoundError: No module named 'odoo'", 'test')).toBe('importapus')
    expect(classify('Exceeded timeout of 5000 ms for a test', 'test')).toBe('timeoutle')
    expect(classify('expected 3 to be 4', 'test')).toBe('assertoad')
    expect(classify('5 problems (5 errors, 0 warnings)', 'lint')).toBe('lintworm')
    expect(classify('CONFLICT (content): Merge conflict in a.ts', 'git')).toBe('conflux')
  })

  test('names the newer species from real runner output', async () => {
    expect(classify('RangeError: Maximum call stack size exceeded', 'test')).toBe('recursnake')
    expect(classify('RecursionError: maximum recursion depth exceeded while calling a Python object', 'test')).toBe('recursnake')
    expect(classify('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', 'build')).toBe('heaphant')
    expect(classify('E   MemoryError', 'test')).toBe('heaphant')
    expect(classify('TypeError: fetch failed\n  [cause]: Error: connect ECONNREFUSED 127.0.0.1:5432', 'test')).toBe('pingeon')
    expect(classify("requests.exceptions.ConnectionError: HTTPConnectionPool(host='localhost', port=8069)", 'test')).toBe('pingeon')
    expect(classify("Error: ENOENT: no such file or directory, open 'fixtures/cart.json'", 'test')).toBe('pathmoth')
    expect(classify("FileNotFoundError: [Errno 2] No such file or directory: 'data.csv'", 'test')).toBe('pathmoth')
    expect(classify("E   KeyError: 'partner_id'", 'test')).toBe('rangeroo')
    expect(classify('panic: runtime error: index out of range [5] with length 3', 'test')).toBe('rangeroo')
    expect(classify('E   ZeroDivisionError: division by zero', 'test')).toBe('zerowl')
    expect(classify("thread 'tests::split' panicked at src/lib.rs:4:5:\nattempt to divide by zero", 'test')).toBe('zerowl')
    expect(classify("thread 'tests::parse' panicked at src/lib.rs:9:5:\nboom", 'test')).toBe('panicrab')
    expect(classify('Segmentation fault (core dumped)', 'test')).toBe('panicrab')
    expect(classify('› 1 snapshot failed from 1 test suite.', 'test')).toBe('chamelens')
    expect(classify('Snapshot `cart > renders 1` mismatched', 'test')).toBe('chamelens')
    expect(classify('psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "res_partner_ref_uniq"', 'test')).toBe('querydile')
    expect(classify('django.db.utils.IntegrityError: NOT NULL constraint failed: shop_order.total', 'test')).toBe('querydile')
    expect(classify("Error: EACCES: permission denied, open '/etc/hosts'", 'test')).toBe('forbidillo')
    expect(classify('odoo.exceptions.AccessError: You are not allowed to access Sales Target records.', 'test')).toBe('forbidillo')
  })

  test('every species has its own number, from 1 up', async () => {
    expect(SPECIES.map(one => one.no).sort((a, b) => a - b)).toEqual(SPECIES.map((_, i) => i + 1))
    expect(new Set(SPECIES.map(one => one.id)).size).toBe(SPECIES.length)
  })
})

describe('a battle', () => {
  const red = readRun('npm test', 'Tests: 2 failed, 3 passed\nexpected 1 to be 2', true)!
  const less = readRun('npm test', 'Tests: 1 failed, 4 passed\nexpected 1 to be 2', true)!
  const green = readRun('npm test', 'Tests: 5 passed', false)!

  test('starts on red, weakens on progress and is won on green', async () => {
    const appeared = onRun(null, red)
    expect(appeared.type).toBe('appeared')
    if (appeared.type !== 'appeared') return
    expect(appeared.battle.hp).toBe(2)

    const edited = onEdit(appeared.battle, 'src/cart.ts')
    const hit = onRun(edited, less)
    expect(hit.type).toBe('hit')
    if (hit.type !== 'hit') return
    expect(hit.isProgress).toBe(true)
    expect(hit.battle.hp).toBe(1)

    const won = onRun(hit.battle, green)
    expect(won.type).toBe('won')
    if (won.type !== 'won') return
    expect(won.isCaught).toBe(false)
    expect(won.speciesId).toBe('assertoad')
  })

  test('catches the bug only when a test changed during the fight', async () => {
    const appeared = onRun(null, red)
    if (appeared.type !== 'appeared') throw new Error('expected a battle')
    const withTest = onEdit(onEdit(appeared.battle, 'src/cart.ts'), 'src/cart.test.ts')
    const won = onRun(withTest, green)
    expect(won.type === 'won' && won.isCaught).toBe(true)
  })

  test('green with nothing edited reveals a flaky test', async () => {
    const appeared = onRun(null, red)
    if (appeared.type !== 'appeared') throw new Error('expected a battle')
    const won = onRun(appeared.battle, green)
    expect(won.type === 'won' && won.speciesId).toBe('flakeling')
    expect(won.type === 'won' && won.isCaught).toBe(false)
  })

  test('gets confused after three edits of one file with no progress', async () => {
    const appeared = onRun(null, red)
    if (appeared.type !== 'appeared') throw new Error('expected a battle')
    let battle = appeared.battle
    for (let i = 0; i < 3; i += 1) battle = onEdit(battle, 'src/cart.ts')
    const hit = onRun(battle, red)
    expect(hit.type === 'hit' && hit.battle.isConfused).toBe(true)
  })

  test('a lint pass does not end a test battle', async () => {
    const appeared = onRun(null, red)
    if (appeared.type !== 'appeared') throw new Error('expected a battle')
    expect(onRun(appeared.battle, readRun('npx eslint .', '', false)!).type).toBe('none')
  })
})

describe('progress', () => {
  test('levels follow the XP curve', async () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(xpForLevel(16))).toBe(16)
    expect(levelOf(xpForLevel(16) - 1)).toBe(15)
    expect(levelOf(10_000_000)).toBe(100)
  })

  test('a stored profile is read defensively', async () => {
    expect(readProfile(null)).toEqual(EMPTY_PROFILE)
    expect(readProfile({ xp: -5, wins: 'many', caught: { typhox: 2, bad: 'x' } })).toEqual({
      xp: 0,
      wins: 0,
      caught: { typhox: 2 },
      seen: {},
    })
    expect(withWin(EMPTY_PROFILE, 'typhox', true, 60)).toEqual({ xp: 60, wins: 1, caught: { typhox: 1 }, seen: { typhox: 1 } })
  })
})

describe('sprites', () => {
  test('every species packs into cells of the right size', async () => {
    for (const species of SPECIES) {
      const packed = spriteCells(species)
      expect(packed.columns).toBeLessThanOrEqual(16)
      expect(packed.rows).toBe(Math.ceil(species.rows.length / 2))
      expect(packed.cells.length).toBe(Math.ceil((packed.columns * packed.rows * 12) / 3) * 4)
      for (const row of species.rows) expect(row.length).toBe(species.rows[0].length)
    }
  })

  test('every species draws as SVG on one card-sized canvas', async () => {
    for (const species of SPECIES) {
      const drawn = spriteSvg(species, false, { columns: 16, rows: 12 })
      expect(drawn.columns).toBe(16)
      expect(drawn.rows).toBe(12)
      expect(drawn.source.startsWith('<svg')).toBe(true)
      expect(drawn.source.length).toBeLessThanOrEqual(131072)
      expect(drawn.source).toContain(`#${species.colors[Object.keys(species.colors)[0]].toString(16).padStart(6, '0')}`)
    }
    expect(spriteSvg(SPECIES[0], true).source).toContain('#6e6e6e')
  })

  test('base64 matches the standard alphabet', async () => {
    expect(toBase64(new TextEncoder().encode('Bugdex!'))).toBe('QnVnZGV4IQ==')
  })
})

describe('in a session', () => {
  const shell = (text: string, isError: boolean) => ({
    result: { stdout: text, stderr: '', interrupted: false },
    text,
    isError,
  })

  test('a red run, a test edit and a green run put the bug in the Bugdex', async ($, on) => {
    const memory = new Map<string, unknown>()
    on('store.get', async (_, e) => ({ value: memory.get(e.key) }))
    on('store.set', async (_, e) => {
      memory.set(e.key, e.value)
      return { value: undefined }
    })
    let answer = shell('Tests: 1 failed, 4 passed\nTypeError: total is not a function', true)
    on('tool.call', { tool: 'Bash' }, async () => answer)
    on('tool.call', { tool: 'Edit' }, async () => ({ result: {}, text: 'edited' }))
    on('session.start', async (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect(readProfile(memory.get('profile')).seen).toEqual({ typhox: 1 })

    await $.tool.call({ tool: 'Edit', file_path: 'src/cart.test.ts', old_string: 'a', new_string: 'b' })
    answer = shell('Tests: 5 passed', false)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    const profile = readProfile(memory.get('profile'))
    expect(profile.caught).toEqual({ typhox: 1 })
    expect(profile.wins).toBe(1)
    expect(profile.xp).toBe(30 + 15 + 25)
  })

  test('a red PowerShell run starts a fight too', async ($, on) => {
    const memory = new Map<string, unknown>()
    on('store.get', async (_, e) => ({ value: memory.get(e.key) }))
    on('store.set', async (_, e) => {
      memory.set(e.key, e.value)
      return { value: undefined }
    })
    on('tool.call', { tool: 'PowerShell' }, async () => shell('Tests: 1 failed, 4 passed\nTypeError: total is not a function', true))
    on('session.start', async (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: 'C:\\repo', surface: 'desktop', isInteractive: true })

    await $.tool.call({ tool: 'PowerShell', command: 'npm test' })
    expect(readProfile(memory.get('profile')).seen).toEqual({ typhox: 1 })
  })
})

describe('drawing', () => {
  const BAND = {
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as const
  const PANE = {
    component: 'Pane',
    requestId: 'bugdex',
    props: { title: 'Bugdex', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const

  test('the band and the Bugdex draw on the terminal and the desktop', async ($, on) => {
    const memory = new Map<string, unknown>([['profile', { xp: 9000, wins: 3, caught: { typhox: 1 }, seen: { nullbat: 2 } }]])
    on('store.get', async (_, e) => ({ value: memory.get(e.key) }))
    on('store.set', async (_, e) => {
      memory.set(e.key, e.value)
      return { value: undefined }
    })
    on('session.start', async (_, e) => ({ cwd: e.cwd }))
    on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'bugdex', surface, ...BAND })
      expect(await band.find({ type: 'Text', text: /Patchwarden/ })).toBeDefined()
      expect(await band.find({ key: 'bugdex-open' })).toBeDefined()
      await band.unmount()

      const pane = await $.ui.mount({ plugin: 'bugdex', surface, ...PANE })
      expect(await pane.find({ type: 'Text', text: /Typhox/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /Seen, not caught/ })).toBeDefined()
      // Pictures: half blocks on the terminal for the mascot and the two species met;
      // SVG on the desktop for those and a question mark for each species not met.
      const pictures = await pane.findAll({ type: surface === 'terminal' ? 'Raster' : 'Svg' })
      expect(pictures).toHaveLength(surface === 'terminal' ? 3 : 1 + SPECIES.length)
      await pane.unmount()
    }
  })

  test('after /clear, with no session.start, the band still draws the stored progress', async ($, on) => {
    const memory = new Map<string, unknown>([['profile', { xp: 9000, wins: 3, caught: { typhox: 1 }, seen: {} }]])
    on('store.get', async (_, e) => ({ value: memory.get(e.key) }))
    on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }))

    const band = await $.ui.mount({ plugin: 'bugdex', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /Patchwarden/ })).toBeDefined()
    await band.unmount()

    memory.set('bandHidden', true)
    const hidden = await $.ui.mount({ plugin: 'bugdex', surface: 'terminal', ...BAND })
    expect(await hidden.find({ key: 'bugdex-open' })).toBeUndefined()
    await hidden.unmount()
  })

  test('a red run opens the battle pane with both creatures', async ($, on) => {
    const memory = new Map<string, unknown>()
    on('store.get', async (_, e) => ({ value: memory.get(e.key) }))
    on('store.set', async (_, e) => {
      memory.set(e.key, e.value)
      return { value: undefined }
    })
    const opened: string[] = []
    on('ui.open', async (_, e) => {
      opened.push(e.id)
      return { isPlaced: true }
    })
    on('tool.call', { tool: 'Bash' }, async () => ({ result: {}, text: '# tests 4\n# pass 2\n# fail 2', isError: true }))
    on('session.start', async (_, e) => ({ cwd: e.cwd }))
    on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect(opened).toEqual(['bugdex-battle'])

    for (const surface of ['terminal', 'desktop'] as const) {
      const pane = await $.ui.mount({ plugin: 'bugdex', surface, ...PANE, requestId: 'bugdex-battle' })
      expect(await pane.find({ type: 'Text', text: /Assertoad/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /Patchling/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /2\/2 failing/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /What will Claude do\?/ })).toBeDefined()
      expect(await pane.find({ key: 'battle-hide' })).toBeDefined()
      expect(await pane.findAll({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toHaveLength(2)
      // Block glyphs run wider than a cell off the terminal, so bars there are boxes.
      const glyphBar = await pane.find({ type: 'Text', text: /█/ })
      if (surface === 'terminal') expect(glyphBar).toBeDefined()
      else expect(glyphBar).toBeUndefined()
      await pane.unmount()
    }
  })
})
