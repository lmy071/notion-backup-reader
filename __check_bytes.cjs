const fs = require('fs');
const buf = fs.readFileSync('vite-plugin-notion-api.ts');

// Find "开始同" in raw bytes
const search = Buffer.from('开始同', 'utf8');
let idx = buf.indexOf(search);
if (idx >= 0) {
  console.log('Found 开始同 at byte offset:', idx);
  // Show 60 bytes starting from the e5bc80 (开)
  // First, go back a bit to see context
  const ctx = buf.subarray(idx - 10, idx + 30);
  console.log('Raw hex:', ctx.toString('hex'));
  
  // Decode carefully
  let i = 0;
  while (i < ctx.length) {
    const b = ctx[i];
    let cp, clen;
    if (b < 0x80) { cp = b; clen = 1; }
    else if ((b & 0xE0) === 0xC0) { cp = ((b & 0x1F) << 6) | (ctx[i+1] & 0x3F); clen = 2; }
    else if ((b & 0xF0) === 0xE0) { cp = ((b & 0x0F) << 12) | ((ctx[i+1] & 0x3F) << 6) | (ctx[i+2] & 0x3F); clen = 3; }
    else if ((b & 0xF8) === 0xF0) { cp = ((b & 0x07) << 18) | ((ctx[i+1] & 0x3F) << 12) | ((ctx[i+2] & 0x3F) << 6) | (ctx[i+3] & 0x3F); clen = 4; }
    else { cp = 0xFFFD; clen = 1; }
    console.log(`  byte ${i} hex=${ctx.subarray(i,i+clen).toString('hex')} cp=U+${cp.toString(16).padStart(4,'0')} char="${String.fromCodePoint(cp)}"`);
    i += clen;
  }
} else {
  console.log('开始同 not found in file');
}

// Also search for specific corrupted sequence efbfbd 3f (U+FFFD followed by ?)
console.log('\n--- Searching for EF BF BD 3F sequences ---');
let searchPos = 0;
const pattern = Buffer.from([0xEF, 0xBF, 0xBD, 0x3F]);
let count = 0;
while ((searchPos = buf.indexOf(pattern, searchPos)) !== -1 && count < 10) {
  const ctx = buf.subarray(Math.max(0, searchPos - 10), Math.min(buf.length, searchPos + 10));
  console.log(`@${searchPos}: ${ctx.toString('hex')}  ascii="${ctx.toString('ascii').replace(/[^\x20-\x7E]/g,'.')}"`);
  searchPos++;
  count++;
}
