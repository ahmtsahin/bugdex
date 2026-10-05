import type { Sprite } from './species'

// Packs a sprite into the cells a terminal Raster draws: two pixel rows per
// terminal row, using half blocks so each cell carries a top and a bottom color.

const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const SPACE = 0x20
const SILHOUETTE = 0x6e6e6e

export type Cells = { columns: number; rows: number; cells: string }

export function spriteCells(sprite: Sprite, isSilhouette = false): Cells {
  const columns = Math.max(...sprite.rows.map(row => row.length))
  const rows = Math.ceil(sprite.rows.length / 2)
  const view = new DataView(new ArrayBuffer(columns * rows * 12))
  const colorAt = (x: number, y: number): number | null => {
    const letter = sprite.rows[y]?.[x]
    const color = letter === undefined ? undefined : sprite.colors[letter]
    if (color === undefined) return null
    return isSilhouette ? SILHOUETTE : color
  }

  for (let row = 0; row < rows; row += 1) {
    for (let x = 0; x < columns; x += 1) {
      const top = colorAt(x, row * 2)
      const bottom = colorAt(x, row * 2 + 1)
      const [glyph, fg, bg] =
        top !== null
          ? [UPPER, top, bottom ?? DEFAULT]
          : bottom !== null
            ? [LOWER, bottom, DEFAULT]
            : [SPACE, DEFAULT, DEFAULT]
      const at = (row * columns + x) * 12
      view.setUint32(at, glyph, true)
      view.setUint32(at + 4, fg, true)
      view.setUint32(at + 8, bg, true)
    }
  }

  return { columns, rows, cells: toBase64(new Uint8Array(view.buffer)) }
}

// The same sprite for the surfaces that draw SVG (desktop, editor, phone): a
// pixel per viewBox unit, one rect per run of a letter along a row. A canvas
// bigger than the sprite stands it at the bottom center, so cards line up.

export type Canvas = { columns: number; rows: number }
export type Picture = Canvas & { source: string }

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
const svg = ({ columns, rows }: Canvas, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows}" shape-rendering="crispEdges">${body}</svg>`

export function spriteSvg(sprite: Sprite, isSilhouette = false, canvas: Canvas = { columns: 0, rows: 0 }): Picture {
  const width = Math.max(...sprite.rows.map(row => row.length))
  const size = { columns: Math.max(canvas.columns, width), rows: Math.max(canvas.rows, sprite.rows.length) }
  const left = Math.floor((size.columns - width) / 2)
  const top = size.rows - sprite.rows.length
  let rects = ''
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let end = x + 1
      while (end < row.length && row[end] === row[x]) end += 1
      const color = sprite.colors[row[x]]
      if (color !== undefined) {
        const fill = hex(isSilhouette ? SILHOUETTE : color)
        rects += `<rect x="${left + x}" y="${top + y}" width="${end - x}" height="1" fill="${fill}"/>`
      }
      x = end
    }
  })
  return { ...size, source: svg(size, rects) }
}

// What an unseen species shows in its place: a question mark the size of a sprite.
export function unknownSvg(canvas: Canvas): Picture {
  const mark = `<text x="${canvas.columns / 2}" y="${canvas.rows * 0.8}" font-size="${canvas.rows * 0.8}" font-family="sans-serif" text-anchor="middle" fill="${hex(SILHOUETTE)}">?</text>`
  return { ...canvas, source: svg(canvas, mark) }
}

const ALPHABET ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}
