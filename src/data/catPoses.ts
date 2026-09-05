export const catPoses = [
  { label: '安静读书', motion: 'sway' },
  { label: '挥爪打招呼', motion: 'hop' },
  { label: '蜷着睡觉', motion: 'breathe' },
  { label: '伸个懒腰', motion: 'sway' },
  { label: '开心跳跃', motion: 'hop' },
  { label: '喝杯热茶', motion: 'breathe' },
  { label: '送你爱心', motion: 'float' },
  { label: '认真写字', motion: 'sway' },
  { label: '戴耳机听歌', motion: 'sway' },
  { label: '玩掌上游戏', motion: 'hop' },
  { label: '抱紧小鱼', motion: 'breathe' },
  { label: '躲进纸箱', motion: 'hop' },
  { label: '撑伞等雨停', motion: 'sway' },
  { label: '追逐毛线球', motion: 'hop' },
  { label: '舔爪洗脸', motion: 'sway' },
  { label: '搬运小书堆', motion: 'hop' },
  { label: '放大镜探险', motion: 'sway' },
  { label: '坐在月亮上', motion: 'float' },
  { label: '给小苗浇水', motion: 'breathe' },
  { label: '举爪欢呼', motion: 'hop' },
] as const

/** Six distinct poses, with a different pose in each slot than the prior refresh. */
export function selectCatPoses(previous: readonly number[] = [], random = Math.random): number[] {
  const available = catPoses.map((_, index) => index)
  return Array.from({ length: 6 }, (_, slot) => {
    const candidates = available.filter(index => index !== previous[slot])
    const selected = candidates[Math.floor(random() * candidates.length)]!
    available.splice(available.indexOf(selected), 1)
    return selected
  })
}

/** Called once by the app shell; route navigation never reshuffles the stickers. */
export function createCatStickerSession(): number[] {
  const key = 'notebook-cat-poses'
  let previous: number[] = []
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    if (Array.isArray(stored)) {
      previous = stored.filter(
        (value): value is number =>
          Number.isInteger(value) && value >= 0 && value < catPoses.length,
      )
    }
  } catch {
    /* Storage is optional, so random poses also work in restricted browsers. */
  }
  const selected = selectCatPoses(previous)
  try {
    sessionStorage.setItem(key, JSON.stringify(selected))
  } catch {
    /* Optional refresh history. */
  }
  return selected
}
