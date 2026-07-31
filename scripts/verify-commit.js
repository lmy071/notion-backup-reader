import { readFileSync } from 'node:fs'
import path from 'node:path'
import pico from 'picocolors'

const msgPath = path.resolve('.git/COMMIT_EDITMSG')
const msg = readFileSync(msgPath, 'utf-8').trim()

const commitRE =
  /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\(.+\))?: [\s\S]{1,50}$/

if (!commitRE.test(msg)) {
  console.error(pico.red('✖ Commit message format invalid'))
  console.error(pico.yellow('  Expected: type(scope): subject (max 50 chars)'))
  console.error(pico.yellow('  Types: feat, fix, docs, dx, style, refactor, perf, test, workflow, build, ci, chore, types, wip, release'))
  console.error(pico.yellow(`  Received: "${msg}"`))
  process.exit(1)
}

console.log(pico.green('✔ Commit message format OK'))
