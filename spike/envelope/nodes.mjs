// What a host must expose of a display list (SPEC-PLAYER 9.2), worked out the way a binding does it and knowing no more:
// a `push` that carries `role` opens a node, its `pop` closes it; a later group of the same `id` goes on with the same node;
// the text of a node is the `s` of the text items directly in it, each followed by its `then` if it has one, in list order.
// `tree(list)` gives the nodes as { role, level, label, lang, press, pressed, current, content }, `content` being texts and nodes in order.
// (Where a group lies, its `box`, is for placing the node and is no part of what it says: left out here.)
export function tree(list) {
  const root = { content: [] }, seen = new Map(), open = [root], pushed = [];
  for (const [kind, it] of list) {
    const p = open[open.length - 1];
    if (kind === 'push') {
      let n = null;
      if (it.role) { n = seen.get(it.id); if (!n) { const { m, clip, alpha, id, box, ...said } = it; n = { ...said, content: [] }; seen.set(it.id, n); p.content.push(n); } }
      pushed.push(n); if (n) open.push(n);
    } else if (kind === 'pop') { if (pushed.pop()) open.pop(); }
    else if (kind === 'text') { const s = it.s + (it.then || ''); if (typeof p.content.at(-1) === 'string') p.content[p.content.length - 1] += s; else p.content.push(s); }
  }
  return root.content;
}
// The same in one sequence, in reading order: each node with its depth and the text directly in it; text in no node as { depth, text }.
export const flat = (content, depth = 0) => content.flatMap(n => typeof n === 'string' ? [{ depth, text: n }]
  : [{ depth, ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'content')), text: n.content.filter(c => typeof c === 'string').join('') }, ...flat(n.content.filter(c => typeof c !== 'string'), depth + 1)]);
// All the text of a node, as it is read.
export const read = n => typeof n === 'string' ? n : n.content.map(read).join('');
