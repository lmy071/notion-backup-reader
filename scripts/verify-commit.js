import { readFileSync } from 'node:fs'
import path from 'node:path'
import pico from 'picocolors'

const msgPath = path.resolve('.git/COMMIT_EDITMSG')
const msg = readFileSync(msgPath, 'utf-8').trim()

// type 枚举：英文（Conventional Commits）+ 中文别名
const TYPES_EN = 'feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release'
const TYPES_ZH = '功能|特性|修复|修正|文档|体验|样式|格式|重构|性能|测试|工作流|构建|集成|杂项|琐事|类型|进行中|发布|回退|撤销'
// 支持中英文混用：type 中英、scope 括号半角/全角、分隔冒号半角/全角、描述中文
const commitRE = new RegExp(
  `^(revert(:|：) )?(${TYPES_EN}|${TYPES_ZH})(\\(.+\\)|（.+）)?(: |：)[\\s\\S]{1,50}$`
)

if (!commitRE.test(msg)) {
  console.error(pico.red('✖ 提交信息格式不正确'))
  console.error(pico.yellow('  格式：type(scope): 描述（最多 50 个字）'))
  console.error(
    pico.yellow('  类型：功能/修复/文档/样式/重构/性能/测试/构建/发布/杂项/回退（也兼容英文 feat/fix/...）')
  )
  console.error(pico.yellow(`  实际内容："${msg}"`))
  process.exit(1)
}

console.log(pico.green('✔ 提交信息格式正确'))
