import fs from 'fs'; import { start } from './binding.mjs';
const wasm = fs.readFileSync(new URL('../kernel/target/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm', import.meta.url));
const fake = (run, s) => ({ adv: [...s].length * run.size * (run.weight >= 700 ? 0.55 : 0.5), asc: run.size * 0.8, desc: run.size * 0.2 });
for (const f of process.argv.slice(2)) {
  const k = await start(wasm, fake); const ok = k.open(new Uint8Array(fs.readFileSync(f))); console.log(f, 'opens:', ok); if (!ok) continue;
  const tx = k.sample({ as: 'text' }); console.log('--- text face'); console.log(tx && tx.text);
  const v = k.sample({ as: 'view', w: 480 }); if (v) console.log('--- view:', v.list.length, 'items, height', v.h, 'rows', v.rows, '; kinds', JSON.stringify(v.list.reduce((a, [k]) => (a[k] = (a[k] || 0) + 1, a), {})));
  const p = k.sample({ as: 'pages' }); if (p) console.log('--- pages:', p.pages, 'pages,', p.list.length, 'items, rows', p.rows);
  if (v) { const texts = v.list.filter(x => x[0] === 'text').slice(0, 6); for (const [, it] of texts) console.log(JSON.stringify({ s: it.s, x: it.x, y: +it.y.toFixed(2), size: it.size, weight: it.weight, adv: it.adv })); }
}
