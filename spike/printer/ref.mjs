// Reference behaviour of the test program, used only to produce expected results.
export function make(v2) {
  const W = 16, H = 12; let rng, grid, body, dir, score, dead, wrap = 0, foods;
  const rnd = () => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return (rng >>> 16) & 0x7fff; };
  const food = () => { if (body.length >= W * H) return; let x, y; do { x = rnd() % W; y = rnd() % H; } while (grid[y * W + x]); foods++; grid[y * W + x] = (v2 && foods % 5 === 0) ? 3 : 2; };
  const api = {
    init(seed) { rng = seed >>> 0; grid = new Uint8Array(W * H); body = [6 * W + 5, 6 * W + 6, 6 * W + 7]; body.forEach(c => grid[c] = 1); dir = 1; score = 0; dead = 0; foods = 0; wrap = 0; food(); },
    set_wrap(on) { wrap = on ? 1 : 0; },
    step(d) { if (dead) return 1; if (d >= 0 && d <= 3 && ((d + 2) & 3) !== dir) dir = d;
      const h = body[body.length - 1]; let x = h % W + [0, 1, 0, -1][dir], y = (h / W | 0) + [-1, 0, 1, 0][dir];
      if (x < 0 || x >= W || y < 0 || y >= H) { if (v2 && wrap) { x = (x + W) % W; y = (y + H) % H; } else { dead = 1; return 1; } }
      const c = y * W + x, v = grid[c];
      if (v >= 2) { score += v === 3 ? 3 : 1; body.push(c); grid[c] = 1; food(); return v2 ? 2 : 0; }
      if (v === 1 && c !== body[0]) { dead = 1; return 1; }
      grid[body.shift()] = 0; body.push(c); grid[c] = 1; return 0; },
    score: () => score, length: () => body.length, head: () => body[body.length - 1], cell: (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? -1 : grid[y * W + x],
    render() { let s = ''; const h = body[body.length - 1]; for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const c = y * W + x, v = grid[c]; s += c === h ? '@' : v === 1 ? 'o' : v === 2 ? '*' : v === 3 ? '$' : '.'; } s += '\n'; } return s; },
  }; return api;
}
// a simple chaser so that walks actually eat food
function walk(v2, seed, n, opts = {}) {
  const g = make(v2), steps = [{ call: 'init', args: [seed] }]; g.init(seed); if (opts.wrap) { g.set_wrap(1); steps.push({ call: 'set_wrap', args: [1] }); }
  let r = seed * 7 + 1;
  for (let i = 0; i < n; i++) {
    r = (Math.imul(r, 69069) + 1) >>> 0; let d = -1;
    if (opts.chase) { const h = g.head(), hx = h % 16, hy = h / 16 | 0; let fx = -1, fy = -1; for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) if (g.cell(x, y) >= 2) { fx = x; fy = y; } d = (r >>> 28) < 3 ? (r >>> 20) & 3 : fx > hx ? 1 : fx < hx ? 3 : fy > hy ? 2 : 0; }
    else d = ((r >>> 24) % 6) - 1;
    const e = g.step(d); steps.push({ call: 'step', args: [d], expect: e });
    if (i % (opts.every || 7) === 0 || e === 1) { steps.push({ call: 'score', expect: g.score() }); steps.push({ call: 'length', expect: g.length() }); steps.push({ call: 'head', expect: g.head() }); steps.push({ call: 'render', args: [4096], expect: 204 }); steps.push({ text: [4096, 204], expect: g.render() }); }
    if (e === 1) { steps.push({ call: 'step', args: [1], expect: 1 }); break; }
  }
  steps.push({ call: 'cell', args: [16, 0], expect: -1 }); steps.push({ call: 'cell', args: [3, -1], expect: -1 });
  return steps;
}
import fs from 'fs';
const mk = (v2, list) => list.map(([name, seed, n, o]) => ({ name, steps: walk(v2, seed, n, o) }));
if (process.argv[2] === 'gen') {
  const first = g => [{ call: 'init', args: [1] }, { call: 'score', expect: 0 }, { call: 'length', expect: 3 }, { call: 'head', expect: 103 }, { call: 'cell', args: [7, 6], expect: 1 }, { call: 'render', args: [4096], expect: 204 }, { text: [4096, 204], expect: (g.init(1), g.render()) }];
  fs.writeFileSync('tests1.json', JSON.stringify([{ name: 'start', steps: first(make(false)) }, ...mk(false, [['straight into wall', 3, 20, {}], ['wander 11', 11, 60, {}], ['chase 5', 5, 150, { chase: 1 }], ['chase 42', 42, 300, { chase: 1, every: 13 }]])]));
  fs.writeFileSync('hidden1.json', JSON.stringify(mk(false, [['h wander 77', 77, 80, {}], ['h chase 9', 9, 400, { chase: 1, every: 5 }], ['h chase 1234', 1234, 600, { chase: 1, every: 3 }], ['h chase 31337', 31337, 600, { chase: 1, every: 1 }], ['h reinit', 8, 30, { chase: 1 }].slice(0, 5)])));
  fs.writeFileSync('tests2.json', JSON.stringify([{ name: 'start', steps: first(make(true)) }, ...mk(true, [['v2 wall still kills', 3, 20, {}], ['v2 chase 5', 5, 200, { chase: 1 }], ['v2 wrap wander 11', 11, 120, { wrap: 1 }], ['v2 wrap chase 42', 42, 400, { chase: 1, wrap: 1, every: 13 }]])]));
  fs.writeFileSync('hidden2.json', JSON.stringify(mk(true, [['h2 chase 9', 9, 500, { chase: 1, every: 5 }], ['h2 wrap chase 1234', 1234, 700, { chase: 1, wrap: 1, every: 3 }], ['h2 wrap wander 31337', 31337, 300, { wrap: 1, every: 1 }], ['h2 chase 2026', 2026, 700, { chase: 1, every: 2 }]])));
  for (const f of ['tests1', 'hidden1', 'tests2', 'hidden2']) { const t = JSON.parse(fs.readFileSync(f + '.json')); console.log(f, t.map(x => x.steps.length + ':' + Math.max(...x.steps.filter(s => s.call === 'score').map(s => s.expect))).join(' ')); }
}
