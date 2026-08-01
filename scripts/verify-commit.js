import { readFileSync } from 'node:fs'
import path from 'node:path'
import pico from 'picocolors'

const msgPath = path.resolve('.git/COMMIT_EDITMSG')
const msg = readFileSync(msgPath, 'utf-8').trim()

// type 枚举：英文（Conventional Commits）+ 中文别名
const TYPES_EN = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|release|revert|types|wip|dx|workflow'
const TYPES_ZH = '功能|特性|修复|修正|文档|样式|格式|重构|性能|测试|构建|集成|杂项|琐事|发布|回退|撤销|迁移|类型|进行中|体验|工作流'

// 支持中英 type、scope 半角/全角括号、冒号半角/全角
const commitRE = new RegExp(
  `^(revert(:|：) )?(${TYPES_EN}|${TYPES_ZH})(\\(.+\\)|（.+）)?(: |：)[\\s\\S]{1,200}$`
)

if (!commitRE.test(msg)) {
  console.error(pico.red('✗ 提交信息格式不正确'))
  console.error(pico.yellow('  格式：type(scope): 描述'))
  console.error(pico.yellow('  type：功能/修复/文档/样式/重构/性能/测试/构建/迁移/杂项/回退（也支持英文）'))
  console.error(pico.yellow(`  实际："${msg}"`))
  process.exit(1)
}

console.log(pico.green('✓ 提交信息格式正确'))
