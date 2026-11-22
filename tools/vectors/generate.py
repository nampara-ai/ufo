#!/usr/bin/env python3
"""Generates the UFO conformance test vectors (SPEC.md, Appendix F).

NON-NORMATIVE. The specification and the files in vectors/ are normative;
this script is not. If it disagrees with either, this script is wrong.

It is not a reader, a writer or a library. Nothing may import it or depend
on it, and it must not grow into one: the kernel, when it exists, must
reproduce every vector on its own, without reference to this file.

Run from the repository root: python3 tools/vectors/generate.py
It rewrites vectors/vectors.json, vectors/minimal.ufx and vectors/history.ufx.
"""
import hashlib, json, os, struct, sys, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "vectors")
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

V = {}

# ---- 1. values ----------------------------------------------------------------
vals = [("null", None), ("true", True), ("int 0", 0), ("int 23", 23), ("int 24", 24),
        ("int -1", -1), ("int 2^32", 1 << 32), ("float 1.5", 1.5), ("float 0.1", 0.1),
        ("float 100000.0", 100000.0), ("float -0.0", -0.0), ("text", "héllo"), ("bytes", b"\x00\xff"),
        ("list", [1, "a", [True]]), ("map sorted by encoded key", {"b": 1, "aa": 2, "a": 3}),
        ("ref", ref(bytes(range(16)))),
        ("anchor", anchor({"o": bytes(range(16)), "a": {"chars": ["s", [bytes([0xc1]) * 16, 0, 0], "end"], "t": ["c", 0, 705600000], "rows": ["k", "q3"]}})),
        ("formula", Tag(55463, ["+", 1, ["get", ref(bytes(16)), "w"]])),
        ("indirect to bytes", Tag(55464, ["b", bytes([0xee]) * 32])),
        ("indirect, veiled, to a value", Tag(55464, ["v", bytes([0xdd]) * 32, True]))]
def describe(v):
    if isinstance(v, Tag): return {"tag": {55461: "ref", 55462: "anchor", 55463: "formula", 55464: "indirect"}[v.n], "of": describe(v.v)}
    if isinstance(v, bytes): return {"bytes_hex": v.hex()}
    if isinstance(v, float): return {"float": repr(v)}
    if isinstance(v, list): return [describe(x) for x in v]
    if isinstance(v, dict): return {"map": [[k, describe(x)] for k, x in v.items()]}
    return v
V["values"] = [{"name": n, "value": describe(v), "hex": enc(v).hex()} for n, v in vals]
V["values_malformed"] = [{"name": n, "hex": h} for n, h in (
    ("integer not in shortest form", "1817"), ("map keys out of order", "a2616201616101"),
    ("duplicate map key", "a2616101616102"), ("indefinite-length list", "9f01ff"),
    ("float not in shortest form (1.5 as binary64)", "fb3ff8000000000000"), ("NaN", "f97e00"),
    ("ref tag on 15 bytes", "d9d8a54f" + "00" * 15), ("non-text map key", "a10101"),
    ("simple value 16", "f0"), ("invalid UTF-8", "62c328"))]

# ---- 2. record hashes -----------------------------------------------------------
V["record_hashes"] = [
    {"kind": "chunk", "bytes_hex": b"abc".hex(), "hash": rhash(CHUNK, b"abc").hex()},
    {"kind": "node", "value": '{k: "map", e: []}', "bytes_hex": enc({"k": "map", "e": []}).hex(),
     "hash": rhash(NODE, enc({"k": "map", "e": []})).hex()}]

# ---- 3. blobs: content-defined chunks and a content-defined tree (section 1.4) ----------
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
def stream(n, label=b"ufo-test-stream"):
    out = bytearray(); i = 0
    while len(out) < n: out += sha(label + struct.pack("<Q", i)); i += 1
    return bytes(out[:n])
V["gear"] = {"rule": "G[i] = first 8 bytes, little-endian, of SHA-256('ufo-gear-1' || byte i)",
             "G": ["%016x" % g for g in GEAR[:4]] + ["..."], "G_255": "%016x" % GEAR[255],
             "sha256_of_table_as_256_little_endian_u64": sha(b"".join(struct.pack("<Q", g) for g in GEAR)).hex()}
V["blobs"] = []
def blob_vector(name, data, extra=None):
    h, shape, cs = blob_tree(data)
    v = {"name": name, "len": len(data), "sha256": sha(data).hex(), "chunks": len(cs),
         "first_chunk_lengths": [len(c) for c in cs[:8]], "groups_per_level": shape, "blob_hash": h.hex()}
    if len(cs) <= 2: v["node_hex"] = blob_node(len(data), sha(data), 0, [(len(c), rhash(CHUNK, c)) for c in cs]).hex()
    if extra: v.update(extra)
    V["blobs"].append(v); return h, cs
STREAM = "bytes are SHA-256('ufo-test-stream' || u64le(i)) for i = 0, 1, 2, ... concatenated and cut to length"
blob_vector("empty", b""); blob_vector("abc", b"abc")
blob_vector("2047 bytes of the test stream: below the minimum, one chunk", stream(2047), {"stream": STREAM})
blob_vector("65536 zero bytes: no cut point is found, so one chunk of the maximum size", bytes(65536))
blob_vector("65537 zero bytes: a maximum chunk and a one-byte chunk", bytes(65537))
big = stream(1 << 20); h1, c1 = blob_vector("1 MiB of the test stream", big, {"stream": STREAM})
edited = big[:500000] + b"0123456789" + big[500000:]
h2, c2 = blob_vector("the same with ten bytes inserted at offset 500000", edited)
s1, s2 = set(rhash(CHUNK, c) for c in c1), set(rhash(CHUNK, c) for c in c2)
V["blobs"][-1]["chunks_shared_with_the_unedited_stream"] = len(s1 & s2)
V["blobs"][-1]["chunks_not_shared"] = len(s2 - s1)
huge = stream(40 << 20)
blob_vector("40 MiB of the test stream: more than one group, so a tree", huge, {"stream": STREAM})

# ---- 4. object maps ---------------------------------------------------------------
def object_map(entries, depth=0, out=None):
    if len(entries) <= 32:
        node = enc({"k": "map", "e": [[i, h] for i, h in entries]})
    else:
        kids = {}
        for i, h in entries: kids.setdefault(i[depth], []).append((i, h))
        node = enc({"k": "map", "c": {"%02x" % b: object_map(es, depth + 1, out) for b, es in kids.items()}})
    if out is not None and node not in out: out.append(node)
    return rhash(NODE, node)
V["object_maps"] = []
for n in (1, 32, 33, 9000):
    es = sorted((sha(b"id" + struct.pack("<I", i))[:16], sha(b"rev" + struct.pack("<I", i))) for i in range(n))
    V["object_maps"].append({"entries": n, "rule": "id = SHA-256('id' || u32le(i))[:16], revision = SHA-256('rev' || u32le(i)), i = 0..n-1",
                             "root_hash": object_map(es).hex()})

# ---- 5. Ed25519 (RFC 8032), for the seal vector ------------------------------------
P_ = 2**255 - 19; L_ = 2**252 + 27742317777372353535851937790883648493
D_ = -121665 * pow(121666, P_ - 2, P_) % P_
def _add(a, b):
    A = (a[1] - a[0]) * (b[1] - b[0]) % P_; B = (a[1] + a[0]) * (b[1] + b[0]) % P_
    C = 2 * a[3] * b[3] * D_ % P_; Dd = 2 * a[2] * b[2] % P_
    E, F, G, H = B - A, Dd - C, Dd + C, B + A
    return (E * F % P_, G * H % P_, F * G % P_, E * H % P_)
def _mul(s, pt):
    q = (0, 1, 1, 0)
    while s:
        if s & 1: q = _add(q, pt)
        pt = _add(pt, pt); s >>= 1
    return q
def _comp(pt):
    zi = pow(pt[2], P_ - 2, P_); x, y = pt[0] * zi % P_, pt[1] * zi % P_
    return (y | ((x & 1) << 255)).to_bytes(32, "little")
_gy = 4 * pow(5, P_ - 2, P_) % P_
_x2 = (_gy * _gy - 1) * pow(D_ * _gy * _gy + 1, P_ - 2, P_) % P_
_gx = pow(_x2, (P_ + 3) // 8, P_)
if (_gx * _gx - _x2) % P_: _gx = _gx * pow(2, (P_ - 1) // 4, P_) % P_
if _gx & 1: _gx = P_ - _gx
G_ = (_gx, _gy, 1, _gx * _gy % P_)
def ed_keys(sk):
    h = hashlib.sha512(sk).digest(); a = int.from_bytes(h[:32], "little") & ((1 << 254) - 8) | (1 << 254)
    return a, h[32:], _comp(_mul(a, G_))
def ed_sign(sk, msg):
    a, prefix, A = ed_keys(sk)
    r = int.from_bytes(hashlib.sha512(prefix + msg).digest(), "little") % L_; R = _comp(_mul(r, G_))
    k = int.from_bytes(hashlib.sha512(R + A + msg).digest(), "little") % L_
    return R + ((r + k * a) % L_).to_bytes(32, "little")
SK = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")  # RFC 8032 test 1
assert ed_keys(SK)[2].hex() == "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
assert ed_sign(SK, b"").hex().startswith("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8")

# ---- 6. packs -------------------------------------------------------------------------
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

U, T, F = bytes(16), bytes([0xa1]) * 16, bytes([0xfa]) * 16
C1, C2, C3 = (bytes([c]) * 16 for c in (0xc1, 0xc2, 0xc3))
A, K = bytes([0xaa]) * 16, bytes([0xcc]) * 16
who = {"name": "Test Author"}; actor = {"who": who, "with": {"name": "ufo-vectors", "version": "0.5"}}
lineage = bytes([0x11]) * 16
# a block span: begins just before its first element, ends at the end of the sequence (section 8.1)
SPAN = {"at": anchor({"o": T, "a": {"chars": ["s", [C1, 0, 0], "end"]}}), "kind": "block", "role": "paragraph"}
roots, faces, feats = {"primary": ref(F)}, [ref(F)], {"ufo.text": {"v": 1, "required": True}}

def genesis(pk):
    t0 = "Hello, universe."
    ops = [{"op": "new", "obj": U, "type": "ufo.universe"},
           {"op": "set", "obj": U, "key": "lineage", "val": lineage},
           {"op": "new", "obj": T, "type": "ufo.text"},
           {"op": "splice", "obj": T, "key": "chars", "after": None, "ins": t0},
           {"op": "set", "obj": T, "key": ["spans", "p1"], "val": SPAN},
           {"op": "new", "obj": F, "type": "ufo.face"},
           {"op": "set", "obj": F, "key": "of", "val": ref(T)},
           {"op": "set", "obj": F, "key": "medium", "val": "document"},
           {"op": "set", "obj": U, "key": "roots", "val": roots},
           {"op": "set", "obj": U, "key": "faces", "val": faces},
           {"op": "set", "obj": U, "key": "features", "val": feats}]
    hU = revision(pk, U, "ufo.universe", 1, C1, 1001, {"lineage": lineage, "roots": roots, "faces": faces, "features": feats})
    hT = revision(pk, T, "ufo.text", 1, C1, 1002, {"chars": t0, "spans": {"p1": SPAN}}, seq={"chars": [[C1, 0, 16]]})
    hF = revision(pk, F, "ufo.face", 1, C1, 1003, {"of": ref(T), "medium": "document"})
    pub = {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}
    state, hC, hM, hK = commit(pk, {U: hU, T: hT, F: hF}, C1, ops, "First commit.", pub, None, 0, 1004)
    pk.index(); hd = pk.head(hK)
    return state, dict(root=hK, map=hM, change=hC, universe=hU, text=hT, face=hF, head=hd)

pk = Pack(); _, g = genesis(pk)
open(os.path.join(OUT, "minimal.ufx"), "wb").write(pk.b)
V["minimal_pack"] = {"file": "minimal.ufx", "length": len(pk.b), "sha256_of_file": sha(bytes(pk.b)).hex(),
    "root_hash": g["root"].hex(), "object_map_root": g["map"].hex(),
    "revisions": {"universe": g["universe"].hex(), "text": g["text"].hex(), "face": g["face"].hex(), "change": g["change"].hex()},
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "change": C1.hex()},
    "records": pk.log, "index_offset": pk.index_at, "head_hex": g["head"].hex(), "hex": bytes(pk.b).hex(),
    "state_after_removing_last_byte": "no valid head: no commit was ever completed; malformed (section 2.3, step 3)"}

pk = Pack(); state, g = genesis(pk); len1 = len(pk.b)
pk.raw(0x7f, b"a frame of unknown kind: skipped and preserved")
# commit 2: a model replaces a word; a property is replaced; an asset, a clock and 40 small objects appear
t1 = "Hello, world."
data = (b"The quick brown fox jumps over the lazy dog.\n" * 120)[:5000]
hBlob = pk.blob(data, codec=1); ASSET = Tag(55464, ["b", hBlob])
FL = 705600000
items = [(sha(b"item" + struct.pack("<I", i))[:16], i) for i in range(40)]
LONG = "kept outside its node " * 12
ops = [{"op": "splice", "obj": T, "key": "chars", "after": [C1, 6], "del": [[C1, 7, 8]], "old": "universe", "ins": "world"},
       {"op": "set", "obj": F, "key": "medium", "old": "document", "val": "text"},
       {"op": "new", "obj": A, "type": "ufo.asset"},
       {"op": "set", "obj": A, "key": "bytes", "val": ASSET},
       {"op": "set", "obj": A, "key": "media", "val": "text/plain"},
       {"op": "new", "obj": K, "type": "ufo.clock"},
       {"op": "set", "obj": K, "key": "start", "val": 0},
       {"op": "set", "obj": K, "key": "end", "val": 10 * FL}]
for i, n in items:
    ops += [{"op": "new", "obj": i, "type": "ai.nampara.example.item"}, {"op": "set", "obj": i, "key": "n", "val": n}]
ops.append({"op": "set", "obj": items[0][0], "key": "long", "val": LONG})
seq2 = [[C1, 0, 7], [C2, 0, 5], [C1, 7, 8, False], [C1, 15, 1]]
hT2 = revision(pk, T, "ufo.text", 2, C2, 2001, {"chars": t1, "spans": {"p1": SPAN}}, prev=state[T], seq={"chars": seq2}, codec=1)
hF2 = revision(pk, F, "ufo.face", 2, C2, 2002, {"of": ref(T), "medium": "text"}, prev=state[F])
hA = revision(pk, A, "ufo.asset", 1, C2, 2003, {"bytes": ASSET, "media": "text/plain"})
hK2o = revision(pk, K, "ufo.clock", 1, C2, 2004, {"start": 0, "end": 10 * FL})
st = dict(state); st.update({T: hT2, F: hF2, A: hA, K: hK2o})
for n_, (i, n) in enumerate(items):
    props = {"n": n}
    if n_ == 0: props["long"] = pk.outside("t", LONG)     # stored outside the node
    st[i] = revision(pk, i, "ai.nampara.example.item", 1, C2, 2100 + n_, props)
pub = {"actor": actor, "time": 1767229200000, "origin": {"basis": "witnessed", "by": "model", "model": "example-model-1", "asked": who}}
state2, hC2, hM2, hK2 = commit(pk, st, C2, ops, "Shorter greeting.", pub, g["root"], 1, 2005)
pk.index(); pk.head(hK2); len2 = len(pk.b)
key = ed_keys(SK)[2]; signed = {"commit": hK2, "key": key, "time": 1767229260000, "name": "Test Author"}
sig = ed_sign(SK, b"ufo-seal-1" + sha(enc(signed)))
pk.raw(3, enc(dict(signed, signature=sig))); pk.head(hK2); len2s = len(pk.b)
# commit 3: a person appends "!", inserts and removes "?", trims the clock by setting its frame, drops the asset, accepts commit 2
t2 = "Hello, world.!"
ops = [{"op": "splice", "obj": T, "key": "chars", "after": [C1, 15], "ins": "!"},
       {"op": "splice", "obj": T, "key": "chars", "after": [C3, 0], "ins": "?"},
       {"op": "splice", "obj": T, "key": "chars", "del": [[C3, 1, 1]], "old": "?"},
       {"op": "set", "obj": K, "key": "end", "old": 10 * FL, "val": 8 * FL},
       {"op": "set", "obj": K, "key": ["frames", "t"], "val": [1, 1, -2 * FL]},
       {"op": "drop", "obj": A}]
seq3 = seq2 + [[C3, 0, 1], [C3, 1, 1, False]]
hT3 = revision(pk, T, "ufo.text", 3, C3, 3001, {"chars": t2, "spans": {"p1": SPAN}}, prev=hT2, seq={"chars": seq3})
hK3o = revision(pk, K, "ufo.clock", 2, C3, 3002, {"start": 0, "end": 8 * FL, "frames": {"t": [1, 1, -2 * FL]}}, prev=hK2o)
st = dict(state2); st.update({T: hT3, K: hK3o}); del st[A]
pub = {"actor": actor, "time": 1767232800000, "origin": {"basis": "witnessed", "by": "person", "who": who},
       "decisions": [{"about": ref(C2), "verdict": "accept", "who": who}]}
state3, hC3, hM3, hK3 = commit(pk, st, C3, ops, None, pub, hK2, 2, 3003)
pk.index(); pk.head(hK3)
open(os.path.join(OUT, "history.ufx"), "wb").write(pk.b)
def seqj(q): return [[r[0].hex()] + r[1:] for r in q]
def B(c, n, side): return [c.hex(), n, side]
V["history_pack"] = {"file": "history.ufx", "length": len(pk.b), "sha256_of_file": sha(bytes(pk.b)).hex(),
    "commits": [
        {"height": 0, "root_hash": g["root"].hex(), "object_map_root": g["map"].hex(), "objects": 4, "pack_length_at_first_head": len1,
         "text": "Hello, universe.", "span_p1_resolves_to": [0, 16], "seq": seqj([[C1, 0, 16]])},
        {"height": 1, "root_hash": hK2.hex(), "object_map_root": hM2.hex(), "objects": len(state2), "pack_length_at_first_head": len2,
         "text": t1, "span_p1_resolves_to": [0, 13], "seq": seqj(seq2), "text_revision": hT2.hex(), "change_revision": hC2.hex(),
         "note": "its object map has an interior node; one node frame and one chunk frame use codec 1; one property is kept outside its node"},
        {"height": 2, "root_hash": hK3.hex(), "object_map_root": hM3.hex(), "objects": len(state3), "pack_length_at_first_head": len(pk.b),
         "text": t2, "span_p1_resolves_to": [0, 14], "seq": seqj(seq3), "text_revision": hT3.hex(), "change_revision": hC3.hex(),
         "note": "the asset is dropped: absent from this map, present in the previous one"}],
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "asset": A.hex(), "clock": K.hex(),
                   "changes": [C1.hex(), C2.hex(), C3.hex()]},
    "where_to_find": "the text is property chars of the text object; its span is spans.p1.at; the blob is property bytes of the asset; the clock's axis t has extent [start, end] and frame frames.t",
    "blob": {"hash": hBlob.hex(), "len": len(data), "sha256": sha(data).hex(), "chunks": len(chunks_of(data)),
             "note": "the asset's bytes property is an indirect of kind b to this blob; the same blob is named from the operation that set it, inside the change's work"},
    "seal": {"commit": hK2.hex(), "key": key.hex(), "time": 1767229260000, "name": "Test Author", "signature": sig.hex(),
             "signed_bytes_hex": (b"ufo-seal-1" + sha(enc(signed))).hex(), "secret_key_note": "RFC 8032 section 7.1, test 1"},
    "heads": "four head frames: after commit 1, after commit 2, after the seal (naming commit 2 again), after commit 3; each gives the offset of the one before",
    "indexes": "two in the final chain: the one written with commit 3, and before it one covering commits 1 and 2, which absorbed the first by the merge rule",
    "unknown_frame": "kind 0x7f at offset %d" % len1,
    "recovery": [
        {"truncate_to": len(pk.b) - 1, "state": hK2.hex(), "bytes_after_head": len(pk.b) - 1 - len2s, "writer": "no valid head in the tail: truncate"},
        {"truncate_to": len2s, "state": hK2.hex(), "bytes_after_head": 0, "writer": "valid by step 1"},
        {"truncate_to": len2s - 1, "state": hK2.hex(), "bytes_after_head": len2s - 1 - len2, "writer": "the seal's head is torn: truncate; the seal frame is lost"},
        {"truncate_to": len1 + 10, "state": g["root"].hex(), "bytes_after_head": 10, "writer": "truncate"}],
    "anchors_resolved_at_commit_3": [
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", B(C1, 7, 0), B(C1, 14, 1)]}}, "result": "detached", "note": "the word that was replaced"},
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", B(C1, 0, 0), B(C1, 4, 1)]}}, "result": [0, 5]},
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", B(C1, 15, 0), B(C1, 15, 1)]}}, "result": [12, 13]},
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", "start", B(C1, 15, 1)]}}, "result": [0, 13], "note": "ends after the full stop: what was typed after it is outside"},
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", "start", "end"]}}, "result": [0, 14]},
        {"anchor": {"o": T.hex(), "a": {"chars": ["s", B(C1, 10, 1), B(C1, 10, 1)]}}, "result": [12, 12], "note": "a point at a removed element: still attached"},
        {"anchor": {"o": K.hex(), "a": {"t": ["c", 3 * FL, 5 * FL]}}, "result": [1 * FL, 3 * FL]},
        {"anchor": {"o": K.hex(), "a": {"t": ["c", 0, 3 * FL]}}, "result": [0, 1 * FL], "note": "clipped to the extent"},
        {"anchor": {"o": K.hex(), "a": {"t": ["c", 0, 1 * FL]}}, "result": "detached", "note": "wholly outside the extent"},
        {"anchor": {"o": A.hex()}, "result": "detached", "note": "the object was dropped"}]}

# ---- 7. resolving regions (section 4.3) ------------------------------------------------
X, Y = bytes([0x01]) * 16, bytes([0x02]) * 16
demo = [[X, 0, 3], [Y, 0, 2, False], [X, 3, 2], [Y, 2, 1]]     # live: X0 X1 X2 X3 X4 Y2 ; removed: Y0 Y1 after X2
def pos(seq, b):
    if b == "start": return 0
    if b == "end": return sum(r[2] for r in seq if len(r) == 3)
    c, n, side = b; p = 0
    for r in seq:
        live = len(r) == 3
        if r[0] == c and r[1] <= n < r[1] + r[2]:
            return p + ((n - r[1]) + side if live else 0)
        if live: p += r[2]
    return None
def resolve(seq, a, b):
    pa, pb = pos(seq, a), pos(seq, b)
    if pa is None or pb is None: return "detached"
    return "detached" if (pa >= pb and a != b) else [pa, pb]
cases = [("start", "end"), ([X, 0, 0], [X, 2, 1]), ([X, 2, 1], [X, 3, 0]), ([Y, 0, 0], [Y, 1, 1]), ([Y, 0, 0], [X, 3, 1]),
         ([X, 4, 1], "end"), ([Y, 1, 1], [Y, 1, 1]), ([X, 3, 0], [X, 3, 0]), ([X, 9, 0], "end")]
def bj(b): return b if isinstance(b, str) else [b[0].hex(), b[1], b[2]]
V["resolve_sequence"] = {"seq": seqj(demo), "cases": [{"from": bj(a), "to": bj(b), "result": resolve(demo, a, b)} for a, b in cases]}
V["resolve_continuous"] = [
    {"region": [10, 20], "frame": [1, 1, -5], "extent": [0, 100], "result": [5, 15]},
    {"region": [10, 21], "frame": [1, 2, 0], "extent": [0, 100], "result": [5, 10], "note": "integers: 21/2 rounds toward negative infinity"},
    {"region": [-7, 9], "frame": [1, 2, 0], "extent": [-100, 100], "result": [-4, 4], "note": "-7/2 is -4"},
    {"region": [10, 20], "frame": [3, 1, 0], "extent": [0, 40], "result": [30, 40], "note": "clipped"},
    {"region": [10, 20], "frame": [1, 1, 50], "extent": [0, 40], "result": "detached"},
    {"region": [1.5, 2.5], "frame": [3, 2, 1], "extent": [0.0, 10.0], "result": [3.25, 4.75], "note": "floats: x times a, divided by b, plus c"}]
_b = enc({"n": 1}); _bn = blob_node(len(_b), sha(_b), 0, [(len(_b), rhash(CHUNK, _b))]); _bh = rhash(NODE, _bn); _open = salt(7) + _bh
V["value_kept_outside"] = {"value": {"map": [["n", 1]]}, "blob_bytes_hex": _b.hex(), "blob_node_hex": _bn.hex(), "blob_hash": _bh.hex(),
    "indirect_hex": enc(Tag(55464, ["v", _bh])).hex(), "veiled": {"salt_hex": salt(7).hex(), "opening_chunk_hex": _open.hex(),
    "opening_hash": rhash(CHUNK, _open).hex(), "indirect_hex": enc(Tag(55464, ["v", rhash(CHUNK, _open), True])).hex()}}

# ---- 7b. readiness for merging (section 1.10) ------------------------------------------
def rank(e, heights): return (heights[e[0]], e[0], e[1])
def tree_order(parents, heights):
    kids = {}
    for e, par in parents.items(): kids.setdefault(par, []).append(e)
    out = []
    def walk(par):
        for e in sorted(kids.get(par, []), key=lambda e: rank(e, heights), reverse=True): out.append(e); walk(e)
    walk(None); return out
def integrate(seq, parents, heights, e, par):
    """Insert one element into an existing order, knowing only parents and ranks."""
    i = 0 if par is None else seq.index(par) + 1
    def child_of_par_above(x):
        while x is not None and parents.get(x) != par: x = parents.get(x)
        return x
    while i < len(seq):
        sib = child_of_par_above(seq[i])
        if sib is None or sib not in parents or parents[sib] != par or rank(sib, heights) < rank(e, heights): break
        i += 1
    seq.insert(i, e); parents[e] = par
c0, w1, w2, w3, w4 = (bytes([c]) * 16 for c in (0x10, 0x21, 0x22, 0x33, 0x34))
heights = {c0: 0, w1: 1, w2: 1, w3: 2, w4: 2}
base = [((c0, 0), None, "A"), ((c0, 1), (c0, 0), "B"), ((c0, 2), (c0, 1), "C")]
one = [((w1, 0), (c0, 0), "x"), ((w1, 1), (w1, 0), "y"), ((w3, 0), (w1, 0), "n")]       # writer one: "xy" after A; later "n" after x; removes B
two = [((w2, 0), (c0, 0), "p"), ((w2, 1), (w2, 0), "q"), ((w2, 2), (c0, 1), "Z"), ((w4, 0), (w2, 0), "m")]   # writer two: "pq" after A; "Z" after B; later "m" after p
removed = {(c0, 1)}
def run(order):
    seq = []; parents = {}; text = {}
    for e, par, ch in base + order: integrate(seq, parents, heights, e, par); text[e] = ch
    return seq, parents, text
sA, pA, tA = run(one + two); sB, pB, tB = run(two + one); sT = tree_order(pA, heights)
assert sA == sB == sT
def show(seq, text): return "".join(text[e] for e in seq if e not in removed)
V["merge_readiness"] = {
    "base": {"text": "ABC", "change": c0.hex(), "height": 0},
    "writer_one": [{"change": w1.hex(), "height": 1, "ops": ["insert 'xy' after A", "remove B"]},
                   {"change": w3.hex(), "height": 2, "ops": ["insert 'n' after x"]}],
    "writer_two": [{"change": w2.hex(), "height": 1, "ops": ["insert 'pq' after A", "insert 'Z' after B"]},
                   {"change": w4.hex(), "height": 2, "ops": ["insert 'm' after p"]}],
    "order_of_elements": [[e[0].hex(), e[1], tA[e], e in removed] for e in sA],
    "result_one_then_two": show(sA, tA), "result_two_then_one": show(sB, tB), "result_by_definition": show(sT, tA),
    "note": "each line is [change, number, character, removed]; the three results are equal"}

# ---- 8. printer and instrumentation (section 11) ------------------------------------------
def vec(xs): return leb(len(xs)) + b"".join(xs)
def sec(i, b): return bytes([i]) + leb(len(b)) + b
def name(s): return leb(len(s)) + s.encode()
I32, I64, F64 = b"\x7f", b"\x7e", b"\x7c"
def functype(ps, rs): return b"\x60" + vec(ps) + vec(rs)
def module(types, funcs, globals_, exports, bodies):
    out = b"\0asm\1\0\0\0" + sec(1, vec(types)) + sec(3, vec([leb(t) for t in funcs]))
    if globals_: out += sec(6, vec(globals_))
    out += sec(7, vec([name(n) + bytes([k]) + leb(i) for n, k, i in sorted(exports, key=lambda e: e[0].encode())]))
    return out + sec(10, vec([leb(len(b)) + b for b in bodies]))
def charge(n, g=0): return b"\x23" + leb(g) + b"\x42" + leb(n) + b"\x7d\x24" + leb(g) + b"\x23" + leb(g) + b"\x42\x00\x53\x04\x40\x00\x0b"
FUEL = [I64 + b"\x01" + b"\x42\x00\x0b"]
K_ADD, K_EXP = bytes([0xad]) * 16, bytes([0xe1]) * 16
t_add = functype([I32, I32], [I32]); code_add = b"\x20\x00\x20\x01\x6a\x0b"
stored = module([t_add], [0], [], [("add", 0, 0)], [vec([]) + code_add])
instr = module([t_add], [0], FUEL, [("add", 0, 0), ("ufo:fuel", 3, 0)], [vec([]) + charge(4) + code_add])
V["printer"] = {
    "operations": [{"op": "func.add", "key": K_ADD.hex(), "name": "add", "params": ["i32", "i32"], "results": ["i32"],
                    "locals": [], "body": "local.get 0\nlocal.get 1\ni32.add"},
                   {"op": "export.set", "key": K_EXP.hex(), "name": "add", "item": K_ADD.hex()}],
    "baseline": "an empty module", "wasm_hex": stored.hex(),
    "items": {K_ADD.hex(): {"kind": "func", "index": 0, "name": "add", "hash": sha(t_add + vec([]) + code_add).hex(),
                            "hashed_bytes_hex": (t_add + vec([]) + code_add).hex()},
              K_EXP.hex(): {"kind": "export", "index": 0, "name": "add", "hash": sha(name("add") + b"\x00" + K_ADD).hex(),
                            "hashed_bytes_hex": (name("add") + b"\x00" + K_ADD).hex()}}}
t_div = functype([F64, F64], [F64]); code_div = b"\x20\x00\x20\x01\xa3\x0b"
canon = b"\x22\x02\x20\x02\x62\x04\x7c\x44" + struct.pack("<Q", 0x7ff8000000000000) + b"\x05\x20\x02\x0b"
stored_div = module([t_div], [0], [], [("div", 0, 0)], [vec([]) + code_div])
instr_div = module([t_div], [0], FUEL, [("div", 0, 0), ("ufo:fuel", 3, 0)],
                   [vec([b"\x01" + F64]) + charge(4) + b"\x20\x00\x20\x01\xa3" + canon + b"\x0b"])
t_loop = functype([I32], []); code_loop = b"\x03\x40\x20\x00\x41\x01\x6b\x22\x00\x0d\x00\x0b\x0b"
stored_loop = module([t_loop], [0], [], [("spin", 0, 0)], [vec([]) + code_loop])
instr_loop = module([t_loop], [0], FUEL, [("spin", 0, 0), ("ufo:fuel", 3, 0)],
                    [vec([]) + charge(2) + b"\x03\x40" + charge(6) + b"\x20\x00\x41\x01\x6b\x22\x00\x0d\x00\x0b\x0b"])
V["instrumentation"] = [
    {"name": "add: one entry region of 4 instructions", "stored_hex": stored.hex(), "instrumented_hex": instr.hex(),
     "behaviour": "with ufo:fuel = 4, add(2, 3) returns 5 and leaves 0; with ufo:fuel = 3 it traps out of fuel"},
    {"name": "div: NaN canonicalisation after f64.div", "stored_hex": stored_div.hex(), "instrumented_hex": instr_div.hex(),
     "behaviour": "div(0.0, 0.0) returns the bits 0x7ff8000000000000"},
    {"name": "spin: entry region of 2 (loop, final end), loop region of 6", "stored_hex": stored_loop.hex(), "instrumented_hex": instr_loop.hex(),
     "behaviour": "spin(3) consumes 2 + 3*6 = 20; with ufo:fuel = 19 it traps out of fuel on entering the third iteration"}]

# ---- 9. one universe inside another's pack, and the same reference with the records absent (section 1.8) ----
def nested_pair():
    NU, NT, NC = bytes(16), bytes([0xb1]) * 16, bytes([0xd1]) * 16
    PP, PF, PC = bytes([0xb2]) * 16, bytes([0xb3]) * 16, bytes([0xd2]) * 16
    def child(pk):
        t = "Nested."; lin = bytes([0x22]) * 16; r = {"primary": ref(NT)}
        hU = revision(pk, NU, "ufo.universe", 1, NC, 2001, {"lineage": lin, "roots": r})
        hT = revision(pk, NT, "ufo.text", 1, NC, 2002, {"chars": t}, seq={"chars": [[NC, 0, len(t)]]})
        ops = [{"op": "new", "obj": NU, "type": "ufo.universe"}, {"op": "set", "obj": NU, "key": "lineage", "val": lin},
               {"op": "new", "obj": NT, "type": "ufo.text"}, {"op": "splice", "obj": NT, "key": "chars", "after": None, "ins": t},
               {"op": "set", "obj": NU, "key": "roots", "val": r}]
        return commit(pk, {NU: hU, NT: hT}, NC, ops, None, {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 2003)[3]
    def parent(pk, nested):
        of = anchor({"o": NT, "u": nested}); lin = bytes([0x33]) * 16
        pp = {"of": of, "label": "A note from another universe"}; pf = {"of": ref(PP), "medium": "document"}
        pu = {"lineage": lin, "roots": {"primary": ref(PF)}, "faces": [ref(PF)]}
        hU = revision(pk, bytes(16), "ufo.universe", 1, PC, 2011, pu)
        hP = revision(pk, PP, "ufo.portal", 1, PC, 2012, pp); hF = revision(pk, PF, "ufo.face", 1, PC, 2013, pf)
        ops = [{"op": "new", "obj": bytes(16), "type": "ufo.universe"}, {"op": "set", "obj": bytes(16), "key": "lineage", "val": lin},
               {"op": "new", "obj": PP, "type": "ufo.portal"}, {"op": "set", "obj": PP, "key": "of", "val": of}, {"op": "set", "obj": PP, "key": "label", "val": pp["label"]},
               {"op": "new", "obj": PF, "type": "ufo.face"}, {"op": "set", "obj": PF, "key": "of", "val": ref(PP)}, {"op": "set", "obj": PF, "key": "medium", "val": "document"},
               {"op": "set", "obj": bytes(16), "key": "roots", "val": pu["roots"]}, {"op": "set", "obj": bytes(16), "key": "faces", "val": pu["faces"]}]
        root = commit(pk, {bytes(16): hU, PP: hP, PF: hF}, PC, ops, None, {"actor": actor, "time": 1767312000000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 2014)[3]
        pk.index(); pk.head(root); return root, of
    both = Pack(); nested = child(both); of_nested = [r["hash"] for r in both.log]; root, of = parent(both, nested)
    alone = Pack(); alone.n = 1; root2, _ = parent(alone, nested)   # the veil counter continues as in the first file, so the records are the same
    return both, alone, nested, root, root2, of, of_nested
both, alone, nested, root, root2, of, of_nested = nested_pair()
assert root == root2
open(os.path.join(OUT, "nested.ufx"), "wb").write(both.b); open(os.path.join(OUT, "linked.ufx"), "wb").write(alone.b)
V["nested"] = {"nested_file": "nested.ufx", "nested_length": len(both.b), "linked_file": "linked.ufx", "linked_length": len(alone.b),
    "root_hash_of_both_files": root.hex(), "commit_named_by_the_anchor": nested.hex(), "portal_of_hex": enc(of).hex(),
    "records_reached_only_through_the_anchor": of_nested,
    "records_of_the_outer_universe": [r["hash"] for r in alone.log],
    "nested.ufx": "whole. The commit the anchor names is present, so the other universe is nested and each of its records is reachable through the anchor (section 1.3); compaction keeps them. The Portal presents the text 'Nested.'",
    "linked.ufx": "whole. The same universe, with the same root hash; the commit the anchor names is not in the file, so the other universe is linked. The Portal's target is unavailable and the reader shows its label (O4). Nothing is malformed.",
    "plain_text_face_of_both": "A note from another universe"}
json.dump(V, open(os.path.join(OUT, "vectors.json"), "w"), indent=1)
print("minimal.ufx", V["minimal_pack"]["length"], V["minimal_pack"]["root_hash"][:16],
      "| history.ufx", V["history_pack"]["length"], hK3.hex()[:16], "| objects at commit 2:", len(state2))
