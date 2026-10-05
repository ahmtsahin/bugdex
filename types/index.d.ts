export type Kind = 'test' | 'lint' | 'build' | 'git'

export type Battle = {
  kind: Kind
  speciesId: string
  level: number
  hp: number
  maxHp: number
  runs: number
  edits: Record<string, number>
  totalEdits: number
  touchedTests: boolean
  isConfused: boolean
}

export type Encounter = {
  toolUseId: string
  tool: string
  label: string
}

export type Profile = {
  xp: number
  wins: number
  caught: Record<string, number>
  seen: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    bugdex: {
      battle: Battle | null
      encounter: Encounter | null
      hp: number | null
      profile: Profile
      message: string | null
      isBandHidden: boolean
    }
  }
}
