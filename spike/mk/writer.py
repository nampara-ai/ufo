"""Throwaway copy of helper code from tools/vectors/generate.py, for the spike only."""
import hashlib, json, os, struct, sys, zlib

def sha(b): return hashlib.sha256(b).digest()

# ---- deterministic CBOR (RFC 8949, section 4.2.1) -----------------------------
class Tag:
    def __init__(self, n, v): self.n, self.v = n, v
def ref(i): return Tag(55461, i)
def anchor(m): return Tag(55462, m)
def head(major, n):
    if n < 24: return bytes([major << 5 | n])
    for ai, fmt in ((24, ">B"), (25, ">H"), (26, ">I"), (27, ">Q")):
        if n < 1 << (8 * struct.calcsize(fmt)): return bytes([major << 5 | ai]) + struct.pack(fmt, n)
    raise ValueError(n)
def enc(v):
    if v is None: return b"\xf6"
    if v is True: return b"\xf5"
    if v is False: return b"\xf4"
    if isinstance(v, int): return head(0, v) if v >= 0 else head(1, -1 - v)
    if isinstance(v, float):
        for code, fmt in ((0xf9, ">e"), (0xfa, ">f"), (0xfb, ">d")):
            try:
                p = struct.pack(fmt, v)
                if struct.unpack(fmt, p)[0] == v: return bytes([code]) + p
            except OverflowError: pass
        raise ValueError(v)
    if isinstance(v, bytes): return head(2, len(v)) + v
    if isinstance(v, str): b = v.encode(); return head(3, len(b)) + b
    if isinstance(v, list): return head(4, len(v)) + b"".join(enc(x) for x in v)
    if isinstance(v, dict):
        items = sorted((enc(k), enc(x)) for k, x in v.items())
        return head(5, len(items)) + b"".join(k + x for k, x in items)
    if isinstance(v, Tag): return head(6, v.n) + enc(v.v)
    raise TypeError(type(v))

CHUNK, NODE = 1, 2
def rhash(kind, b): return sha(bytes([kind]) + b)
def leb(n):
    out = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n: return bytes(out)
def deflate(b):
    c = zlib.compressobj(9, zlib.DEFLATED, -15); return c.compress(b) + c.flush()
def frame(kind, payload, codec=0):
    if codec == 1: payload = leb(len(payload)) + deflate(payload)
    return bytes([kind, codec]) + leb(len(payload)) + payload

GEAR = [int.from_bytes(sha(b"ufo-gear-1" + bytes([i]))[:8], "little") for i in range(256)]
MASK = ((1 << 13) - 1) << 51; M64 = (1 << 64) - 1
def chunks_of(data):
    out = []; start = 0; h = 0; n = len(data)
    for i in range(n):
        h = ((h << 1) + GEAR[data[i]]) & M64
        size = i + 1 - start
        if (size >= 2048 and not (h & MASK)) or size == 65536:
            out.append(data[start:i + 1]); start = i + 1; h = 0
    if start < n: out.append(data[start:])
    return out
def blob_node(length, stream_sha, level, parts):
    return enc({"k": "blob", "len": length, "sha256": stream_sha, "level": level, "parts": [[l, h] for l, h in parts]})
def blob_tree(data, emit=None):
    """Returns (blob hash, nodes by level, chunk list). emit(kind, bytes) is called for every record."""
    cs = chunks_of(data); parts = [(len(c), rhash(CHUNK, c)) for c in cs]
    if emit:
        for c in cs: emit(CHUNK, c)
    level = 0; offsets = [0]
    for l, _ in parts: offsets.append(offsets[-1] + l)
    spans = list(zip(offsets[:-1], offsets[1:])); shape = []
    while True:
        groups = []; cur = []
        for k, (l, h) in enumerate(parts):
            cur.append(k)
            if (len(cur) >= 2 and int.from_bytes(h[:4], "big") % 1024 == 0) or len(cur) == 4096:
                groups.append(cur); cur = []
        if cur or not groups: groups.append(cur)
        shape.append([len(g) for g in groups])
        if len(groups) == 1:
            node = blob_node(len(data), sha(data), level, parts)
            if emit: emit(NODE, node)
            return rhash(NODE, node), shape, cs
        nparts = []; nspans = []
        for g in groups:
            a, b = spans[g[0]][0], spans[g[-1]][1]
            node = blob_node(b - a, sha(data[a:b]), level, [parts[k] for k in g])
            if emit: emit(NODE, node)
            nparts.append((b - a, rhash(NODE, node))); nspans.append((a, b))
        parts, spans, level = nparts, nspans, level + 1
def object_map(entries, depth=0, out=None):
    if len(entries) <= 32:
        node = enc({"k": "map", "e": [[i, h] for i, h in entries]})
    else:
        kids = {}
        for i, h in entries: kids.setdefault(i[depth], []).append((i, h))
        node = enc({"k": "map", "c": {"%02x" % b: object_map(es, depth + 1, out) for b, es in kids.items()}})
    if out is not None and node not in out: out.append(node)
    return rhash(NODE, node)
def salt(i): return sha(b"ufo-test-salt" + struct.pack("<I", i))[:16]
class Pack:
    """Accumulates frames for one example file. Not a general writer."""
    def __init__(self):
        self.b = bytearray(b"\x89UFO\r\n\x1a\n"); self.off = {}; self.pending = []; self.index_at = 0
        self.head_at = 0; self.index_sizes = []; self.log = []; self.n = 0
    def put(self, kind, rec, codec=0):
        h = rhash(kind, rec)
        if h not in self.off:
            self.off[h] = len(self.b); self.pending.append(h)
            self.log.append({"kind": "chunk" if kind == CHUNK else "node", "codec": codec, "offset": len(self.b), "hash": h.hex(),
                             "hex": rec.hex() if len(rec) <= 600 else None})
            self.b += frame(kind, rec, codec)
        return h
    def node(self, v, codec=0): return self.put(NODE, enc(v), codec)
    def blob(self, data, codec=0):
        return blob_tree(data, lambda kind, rec: self.put(kind, rec, codec if kind == CHUNK else 0))[0]
    def outside(self, kind, v, veiled=False):
        """A value kept outside its node (section 1.4). The blob is never salted; a veil hides its hash."""
        data = v if kind == "b" else v.encode() if kind == "t" else enc(v)
        h = self.blob(data)
        if not veiled: return Tag(55464, [kind, h])
        self.n += 1; return Tag(55464, [kind, self.put(CHUNK, salt(self.n) + h), True])
    def raw(self, kind, payload): self.b += frame(kind, payload)
    def index(self):
        ents = sorted((h, self.off[h]) for h in self.pending); prev = self.index_at
        if self.index_sizes and self.index_sizes[-1][1] <= 2 * len(ents):       # merge rule, section 2.4
            prev_ents, _, prevprev = self.index_sizes.pop(); ents = sorted(ents + prev_ents); prev = prevprev
        at = len(self.b)
        self.raw(4, struct.pack("<QQQ", len(ents), prev, at) + b"".join(h + struct.pack("<Q", o) for h, o in ents))
        self.index_sizes.append((ents, len(ents), prev)); self.index_at = at; self.pending = []
    def head(self, commit):
        body = commit + struct.pack("<QQQQ", self.off[commit], self.index_at, self.head_at, len(self.b) + 75)
        f = frame(5, body + sha(body)[:8]); assert len(f) == 75
        self.head_at = len(self.b); self.b += f; return f

def revision(pk, i, typ, rev, by, sl, p, prev=None, seq=None, codec=0):
    n = {"k": "obj", "id": i, "type": typ, "rev": rev, "by": by, "salt": salt(sl), "p": p}
    if prev: n["prev"] = prev
    if seq: n["seq"] = seq
    return pk.node(n, codec)
def commit(pk, state, change_id, ops, note, public, parent, height, sl):
    work = {"ops": ops}
    if note: work["note"] = note
    cp = dict(public, work=pk.outside("v", work, veiled=True))
    hC = revision(pk, change_id, "ufo.change", 1, change_id, sl, cp)
    state = dict(state); state[change_id] = hC
    nodes = []; hM = object_map(sorted(state.items()), out=nodes)
    for n in nodes: pk.put(NODE, n)
    hK = pk.node({"k": "commit", "v": 1, "parents": [parent] if parent else [], "objects": hM, "change": hC, "height": height})
    return state, hC, hM, hK

