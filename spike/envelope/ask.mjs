// What the tests ask of a page's universe, they ask of its bytes. The page gives the pack it holds (its `ufo.raw`, for looking
// only), and a kernel in Node, whole, answers the projection (SPEC-PLAYER 10.1). A page carries the base alone, as a real file
// does, so the agent's projections are not in it to be asked.
import zlib from 'zlib'; import { start } from '../binding/binding.mjs'; import { kernelWasm } from './parts.mjs';
export const nodeKernel = () => start(kernelWasm(), (piece, s) => ({ adv: [...s].length * piece.size / 2, asc: piece.size * 0.8, desc: piece.size * 0.2 }), b => zlib.inflateRawSync(b));
export const packOf = page => page.evaluate(() => { const b = ufo.raw('pack_bytes'); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); });
export const ask = async (page, q) => { const k = await nodeKernel(); if (!await k.open(new Uint8Array(Buffer.from(await packOf(page), 'base64')))) throw new Error('the pack the page holds does not open in Node'); return k.project(q); };
