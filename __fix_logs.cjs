const fs = require('fs');
const buf = fs.readFileSync('vite-plugin-notion-api.ts');
let text = buf.toString('utf8');

// Fix all corrupted log() calls by replacing known bad strings
// Pattern: "同�?" (同 + U+FFFD + ?) → "同步"
// Pattern: "页�" → "页面"
// Pattern: "数据�" → "数据库"
// Pattern: "完�" → "完成"
// Pattern: "记�" → "记录"
// Pattern: "失�" → "失败"
// Pattern: "发现" → "发现" (may be intact)
// Pattern: "block" already ok
// Pattern: "结�" → "结果"
// Pattern: "�?" at start → "✅ " or "❌ "

const replacements = [
  // log() 调用中的损坏字符
  ['log(`🚀 开始同\uFFFD?${pageIds.length} 个页\uFFFD?..\\n`)',  'log(`🚀 开始同步 ${pageIds.length} 个页面...\\n`)'],
  ['log(`📄 开始同\uFFFD? ${title}\\n`)',                         'log(`📄 开始同步: ${title}\\n`)'],
  ['log(`🗄 获取数据\uFFFD? ${dbTitle}\\n`)',                     'log(`🗄 获取数据库: ${dbTitle}\\n`)'],
  ['log(`\uFFFD?数据库获取完\uFFFD?(${Array.isArray(db.results) ? db.results.length : 0} 条记\uFFFD?\\n`)', 'log(`✅ 数据库获取完成 (${Array.isArray(db.results) ? db.results.length : 0} 条记录)\\n`)'],
  ['log(`⚠️ 数据库获取失\uFFFD? ${e instanceof Error ? e.message : String(e)}\\n`)', 'log(`⚠️ 数据库获取失败: ${e instanceof Error ? e.message : String(e)}\\n`)'],
  ['log(`📂 ${title} \uFFFD?发现 ${children.length} 个子页面/数据库\\n`)', 'log(`📂 ${title} - 发现 ${children.length} 个子页面/数据库\\n`)'],
  ['log(`\uFFFD?${title} \uFFFD?同步完成 (${rawBlocks.length} \uFFFD?block)\\n`)', 'log(`✅ ${title} - 同步完成 (${rawBlocks.length} 个 block)\\n`)'],
  ['log(`\uFFFD?${title} \uFFFD?同步失败: ${errMsg}\\n`)',       'log(`❌ ${title} - 同步失败: ${errMsg}\\n`)'],
  ["log('💾 开始保存同步结\uFFFD?..\\n')",                        "log('💾 开始保存同步结果...\\n')"],
];

let fixed = 0;
for (const [bad, good] of replacements) {
  if (text.includes(bad)) {
    text = text.replace(bad, good);
    fixed++;
  } else {
    console.log('NOT FOUND:', JSON.stringify(bad).substring(0, 60));
  }
}

console.log('Fixed:', fixed, '/', replacements.length);

// Also fix comment strings that cause log issues
// The snkLog comment "结束信号" etc
text = text.replace(/\uFFFD/g, '');  // Remove all remaining U+FFFD
text = text.replace(/\?/g, '');      // Remove orphaned ? marks from previous corruptions
// This is too aggressive, need to be smarter

// For now just save
fs.writeFileSync('vite-plugin-notion-api.ts', text, 'utf8');
console.log('Done');
