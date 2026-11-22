// plants one inverted comparison in 'step', through the printer, as an earlier maintainer would have
import fs from 'fs'; import { execSync } from 'child_process';
const [dir, oldS, newS] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(dir + '/state/state.json')); const f = st.funcs.find(f => f.name === 'step');
let body = typeof f.body === 'string' ? f.body : JSON.stringify(f.body);
if (body.split(oldS).length !== 2) { console.log('pattern count != 1', dir); process.exit(1); }
body = body.replace(oldS, newS); const pr = (n, t) => n.map((x, i) => x ? [x, t[i]] : t[i]);
fs.writeFileSync(dir + '/plant.json', JSON.stringify({ note: 'tidy the collision check in step', by: 'an earlier maintainer', ops: [{ op: 'func.replace', name: 'step', expect: f.hash, locals: pr(f.localNames, f.locals), body: typeof f.body === 'string' ? body : JSON.parse(body) }] }));
console.log(execSync(`node printer.mjs print ${dir}/state ${dir}/plant.json`, { cwd: dir }).toString().trim()); fs.unlinkSync(dir + '/plant.json');
