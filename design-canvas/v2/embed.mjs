// Re-embed local .dc.html / img / canvas.json into the published canvas page.
// usage: node embed.mjs   (run inside design-canvas/v2)
import fs from 'node:fs';
const p = 'landxi-design-b2.html';
const s = fs.readFileSync(p, 'utf8');
const i = s.indexOf('id="appifact-doc"');
const j = s.indexOf('>', i) + 1;
const k = s.indexOf('</script>', j);
const d = JSON.parse(s.slice(j, k));
const f = d.content.files;
for (const n of fs.readdirSync('.').filter(x => x.endsWith('.dc.html'))) f[n] = fs.readFileSync(n, 'utf8');
for (const n of fs.readdirSync('img')) f[n] = fs.readFileSync('img/' + n).toString('base64');
f['canvas.json'] = fs.readFileSync('canvas.json', 'utf8');
const json = JSON.stringify(d).replace(/</g, '\\u003c');
fs.writeFileSync(p, s.slice(0, j) + '\n' + json + '\n' + s.slice(k));
console.log(Object.keys(f).length, 'files', (fs.statSync(p).size / 1e6).toFixed(1) + 'MB');
