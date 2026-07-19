const fs = require('fs');
const buf = fs.readFileSync('vite-plugin-notion-api.ts');
const text = buf.toString('utf8');

// Find all log() calls with corrupted chars
const results = [];
const re = /log\(/g;
let m;
while ((m = re.exec(text)) !== null) {
  const start = m.index;
  // Find the matching ending parenthesis
  let depth = 0, i = start + 3; // point past 'log'
  let inString = false, stringChar = '';
  while (i < text.length) {
    const ch = text[i];
    if (!inString && (ch === '\'' || ch === '"' || ch === '`')) { inString = true; stringChar = ch; }
    else if (inString && ch === stringChar && text[i-1] !== '\\') { inString = false; }
    else if (!inString && ch === '(') depth++;
    else if (!inString && ch === ')') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  const expr = text.substring(start, i);
  if (expr.includes('\uFFFD')) {
    results.push(expr.replace(/\n/g, '\\n'));
  }
}
results.forEach((l, i) => console.log(i + ':', l));
