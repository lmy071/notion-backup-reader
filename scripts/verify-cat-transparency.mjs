import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import assert from 'node:assert/strict'

// Read-only validation: a PNG extension or checkerboard appearance is not alpha.
const defaults = [
  'src/assets/images/pixel-cat-poses-transparent.png',
  'src/assets/images/pixel-reading-cat.png',
]
const paths = process.argv.slice(2)
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
for (const path of paths.length ? paths : defaults) {
  const png = readFileSync(path)
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path}: invalid PNG`)
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20)
  const colorType = png[25]
  assert.ok(colorType === 6 || colorType === 4, `${path}: PNG has no explicit alpha channel`)
  assert.equal(png[24], 8, 'Expected 8-bit channels')
  assert.equal(png[28], 0, 'Expected non-interlaced PNG')
  const chunks = []
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at)
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT')
      chunks.push(png.subarray(at + 8, at + 8 + size))
    at += size + 12
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const channels = colorType === 6 ? 4 : 2
  const stride = width * channels
  assert.equal(raw.length, height * (stride + 1))
  let prior = Buffer.alloc(stride),
    transparent = 0,
    opaque = 0
  const corners = []
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1),
      filter = raw[offset]
    const row = Buffer.alloc(stride)
    assert.ok(filter <= 4, 'Invalid PNG filter')
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0
      const b = prior[x],
        c = x >= channels ? prior[x - channels] : 0
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]
      row[x] = (raw[offset + 1 + x] + predictor) & 255
      if (x % channels === channels - 1) {
        const alpha = row[x]
        if (alpha === 0) transparent++
        if (alpha >= 250) opaque++
      }
    }
    if (y === 0 || y === height - 1) corners.push(row[channels - 1], row[stride - 1])
    prior = row
  }
  assert.ok(transparent > width * height * 0.1, `${path}: missing transparent background`)
  assert.ok(opaque > width * height * 0.1, `${path}: foreground missing or translucent`)
  assert.ok(
    corners.every(alpha => alpha <= 1),
    `${path}: background corners are not transparent`,
  )
  console.log(
    `PASS ${path}: ${width}x${height}, alpha=0 pixels ${transparent}, foreground alpha>=250 pixels ${opaque}, corner alpha values ${corners.join(',')}`,
  )
}
