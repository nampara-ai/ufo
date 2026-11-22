#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
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
        self.head_at = 0; self.index_sizes = []; self.log = []; self.n = 0; self.recs = {}
    def put(self, kind, rec, codec=0):
        h = rhash(kind, rec)
        if h not in self.off:
            self.off[h] = len(self.b); self.pending.append(h); self.recs[h] = (kind, rec, codec)
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
# commit 3: a person appends "!", inserts and removes "?", trims the clock by setting its scale, drops the asset, accepts commit 2
t2 = "Hello, world.!"
ops = [{"op": "splice", "obj": T, "key": "chars", "after": [C1, 15], "ins": "!"},
       {"op": "splice", "obj": T, "key": "chars", "after": [C3, 0], "ins": "?"},
       {"op": "splice", "obj": T, "key": "chars", "del": [[C3, 1, 1]], "old": "?"},
       {"op": "set", "obj": K, "key": "end", "old": 10 * FL, "val": 8 * FL},
       {"op": "set", "obj": K, "key": ["scales", "t"], "val": [1, 1, -2 * FL]},
       {"op": "drop", "obj": A}]
seq3 = seq2 + [[C3, 0, 1], [C3, 1, 1, False]]
hT3 = revision(pk, T, "ufo.text", 3, C3, 3001, {"chars": t2, "spans": {"p1": SPAN}}, prev=hT2, seq={"chars": seq3})
hK3o = revision(pk, K, "ufo.clock", 2, C3, 3002, {"start": 0, "end": 8 * FL, "scales": {"t": [1, 1, -2 * FL]}}, prev=hK2o)
st = dict(state2); st.update({T: hT3, K: hK3o}); del st[A]
pub = {"actor": actor, "time": 1767232800000, "origin": {"basis": "witnessed", "by": "person", "who": who},
       "decisions": [{"about": ref(C2), "verdict": "accept", "who": who}]}
state3, hC3, hM3, hK3 = commit(pk, st, C3, ops, None, pub, hK2, 2, 3003)
pk.index(); pk.head(hK3)
open(os.path.join(OUT, "history.ufx"), "wb").write(pk.b); hist_pk = pk
def seqj(q): return [[r[0].hex()] + r[1:] for r in q]
def B(c, n, side): return [c.hex(), n, side]
V["history_pack"] = {"file": "history.ufx", "length": len(pk.b), "sha256_of_file": sha(bytes(pk.b)).hex(),
    "commits": [
        {"height": 0, "root_hash": g["root"].hex(), "object_map_root": g["map"].hex(), "objects": 4, "pack_length_at_first_head": len1,
         "text": "Hello, universe.", "span_p1_resolves_to": [0, 16], "seq": seqj([[C1, 0, 16]])},
        {"height": 1, "root_hash": hK2.hex(), "object_map_root": hM2.hex(), "objects": len(state2), "pack_length_at_first_head": len2,
         "text": t1, "span_p1_resolves_to": [0, 13], "seq": seqj(seq2), "text_revision": hT2.hex(), "change_revision": hC2.hex(),
         "note": "its object map has an interior node; one node frame and three chunk frames use codec 1; two properties are kept outside their nodes: the asset's bytes and one item's long"},
        {"height": 2, "root_hash": hK3.hex(), "object_map_root": hM3.hex(), "objects": len(state3), "pack_length_at_first_head": len(pk.b),
         "text": t2, "span_p1_resolves_to": [0, 14], "seq": seqj(seq3), "text_revision": hT3.hex(), "change_revision": hC3.hex(),
         "note": "the asset is dropped: absent from this map, present in the previous one"}],
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "asset": A.hex(), "clock": K.hex(),
                   "changes": [C1.hex(), C2.hex(), C3.hex()]},
    "where_to_find": "the text is property chars of the text object; its span is spans.p1.at; the blob is property bytes of the asset; the clock's axis t has extent [start, end] and scale scales.t",
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
    {"region": [10, 20], "scale": [1, 1, -5], "extent": [0, 100], "result": [5, 15]},
    {"region": [10, 21], "scale": [1, 2, 0], "extent": [0, 100], "result": [5, 10], "note": "integers: 21/2 rounds toward negative infinity"},
    {"region": [-7, 9], "scale": [1, 2, 0], "extent": [-100, 100], "result": [-4, 4], "note": "-7/2 is -4"},
    {"region": [10, 20], "scale": [3, 1, 0], "extent": [0, 40], "result": [30, 40], "note": "clipped"},
    {"region": [10, 20], "scale": [1, 1, 50], "extent": [0, 40], "result": "detached"},
    {"region": [1.5, 2.5], "scale": [3, 2, 1], "extent": [0.0, 10.0], "result": [3.25, 4.75], "note": "floats: x times a, divided by b, plus c"}]
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
# A described module (section 11.3) and the bytes the kernel's printer makes of it. The bytes are assembled
# here by hand from the rules of that section; the kernel must print the same from the objects in module.ufx.
MOD, F_ADD, F_SUM, PCH = bytes([0xe0]) * 16, bytes([0xad]) * 16, bytes([0x5e]) * 16, bytes([0xd3]) * 16
add_p = {"name": "add", "params": [["a", "i32"], ["b", "i32"]], "results": ["i32"], "locals": [], "body": [["i32.add", "a", "b"]]}
sum_body = [["block", "done"], ["loop", "top"], ["br_if", "done", ["i32.eqz", "n"]],
            ["local.set", "acc", ["call", ref(F_ADD), "acc", "n"]], ["local.set", "n", ["i32.sub", "n", 1]], ["br", "top"],
            ["end"], ["end"], ["global.set", "total", "acc"], ["return", "acc"]]
sum_p = {"name": "sum_to", "params": [["n", "i32"]], "results": ["i32"], "locals": [["acc", "i32"]], "body": sum_body}
mod_p = {"funcs": [ref(F_ADD), ref(F_SUM)], "memory": {"initial": 1, "maximum": 1}, "globals": {"total": {"type": "i32", "mutable": True, "init": 0}},
         "exports": {"sum_to": ref(F_SUM), "add": ref(F_ADD), "memory": "memory"}}
t_sum = functype([I32], [I32])
code_sum = (b"\x02\x40" + b"\x03\x40" + b"\x20\x00\x45\x0d\x01" + b"\x20\x01\x20\x00\x10\x00\x21\x01" + b"\x20\x00\x41\x01\x6b\x21\x00" + b"\x0c\x00"
            + b"\x0b" + b"\x0b" + b"\x20\x01\x24\x00" + b"\x20\x01\x0f" + b"\x0b")
body_add = vec([]) + code_add; body_sum = vec([b"\x01" + I32]) + code_sum
printed = (b"\0asm\1\0\0\0" + sec(1, vec([t_add, t_sum])) + sec(3, vec([leb(0), leb(1)])) + sec(5, vec([b"\x01\x01\x01"]))
           + sec(6, vec([I32 + b"\x01" + b"\x41\x00\x0b"]))
           + sec(7, vec([name("add") + b"\x00\x00", name("memory") + b"\x02\x00", name("sum_to") + b"\x00\x01"]))   # by length of name, then bytes
           + sec(10, vec([leb(len(body_add)) + body_add, leb(len(body_sum)) + body_sum])))
pk = Pack()
st = {bytes(16): revision(pk, bytes(16), "ufo.universe", 1, PCH, 3001, {"lineage": bytes([0x44]) * 16, "roots": {"primary": ref(MOD)}}),
      MOD: revision(pk, MOD, "ufo.module", 1, PCH, 3002, mod_p),
      F_ADD: revision(pk, F_ADD, "ufo.func", 1, PCH, 3003, add_p, seq={"body": [[PCH, 0, 1]]}),
      F_SUM: revision(pk, F_SUM, "ufo.func", 1, PCH, 3004, sum_p, seq={"body": [[PCH, 1, len(sum_body)]]})}
mops = [{"op": "new", "obj": bytes(16), "type": "ufo.universe"}, {"op": "set", "obj": bytes(16), "key": "lineage", "val": bytes([0x44]) * 16},
        {"op": "set", "obj": bytes(16), "key": "roots", "val": {"primary": ref(MOD)}}, {"op": "new", "obj": F_ADD, "type": "ufo.func"}]
mops += [{"op": "set", "obj": F_ADD, "key": k, "val": add_p[k]} for k in ("name", "params", "results", "locals")]
mops += [{"op": "splice", "obj": F_ADD, "key": "body", "after": None, "ins": add_p["body"]}, {"op": "new", "obj": F_SUM, "type": "ufo.func"}]
mops += [{"op": "set", "obj": F_SUM, "key": k, "val": sum_p[k]} for k in ("name", "params", "results", "locals")]
mops += [{"op": "splice", "obj": F_SUM, "key": "body", "after": None, "ins": sum_body}, {"op": "new", "obj": MOD, "type": "ufo.module"}]
mops += [{"op": "set", "obj": MOD, "key": k, "val": mod_p[k]} for k in ("funcs", "memory", "globals", "exports")]
_, _, _, mroot = commit(pk, st, PCH, mops, "A module, described.", {"actor": actor, "time": 1767398400000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 3005)
pk.index(); pk.head(mroot); open(os.path.join(OUT, "module.ufx"), "wb").write(pk.b)
V["printer"] = {
    "file": "module.ufx", "length": len(pk.b), "root_hash": mroot.hex(), "module": MOD.hex(),
    "functions": {"add": {"id": F_ADD.hex(), "properties_hex": enc(add_p).hex()}, "sum_to": {"id": F_SUM.hex(), "properties_hex": enc(sum_p).hex()}},
    "module_properties_hex": enc(mod_p).hex(),
    "statements_of_sum_to": ['["block","done"]', '["loop","top"]', '["br_if","done",["i32.eqz","n"]]', '["local.set","acc",["call",<ref to add>,"acc","n"]]',
                             '["local.set","n",["i32.sub","n",1]]', '["br","top"]', '["end"]', '["end"]', '["global.set","total","acc"]', '["return","acc"]'],
    "printed_hex": printed.hex(), "printed_length": len(printed),
    "behaviour": "sum_to(4) returns 10 and leaves the global at 10; add(2, 3) returns 5",
    "notes": ["types in order of first use; exports in the order of their keys in the encoded map (add, memory, sum_to)",
              "a bare name is local.get of a local or parameter, else global.get; a bare integer is i32.const",
              "the body of sum_to has one run of locals: one i32"]}
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

# ---- 8b. digests of pins (section 4.4), at the last commit of history.ufx ----
def digest(sl, covered, followed): return sha(sl + enc(covered) + b"".join(i + h for i, h in sorted(followed)))
cov_text = {"chars": ["Hello, ", {"spans": {"p1": SPAN}}]}
cov_face = {"of": ref(T), "medium": "text"}
V["digests"] = [
    {"pin": "the text of history.ufx at its last commit, the region from before element (c1, 0) to after element (c1, 6)",
     "region_hex": enc(["s", [C1, 0, 0], [C1, 6, 1]]).hex(), "salt": salt(4001).hex(),
     "covered_value_hex": enc(cov_text).hex(), "followed": [],
     "note": "the covered items are 'Hello, '; the one span touches them; an anchor inside a span is not followed",
     "digest": digest(salt(4001), cov_text, []).hex()},
    {"pin": "the face object of history.ufx at its last commit, whole", "salt": salt(4002).hex(),
     "covered_value_hex": enc(cov_face).hex(), "followed": [{"id": T.hex(), "revision": hT3.hex()}],
     "note": "the face refers to the text, so the text's identity and current revision hash follow the covered value",
     "digest": digest(salt(4002), cov_face, [(T, hT3)]).hex()}]

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
        st_, hC_, hM_, hK_ = commit(pk, {NU: hU, NT: hT}, NC, ops, None, {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 2003)
        NP.update(inner=st_, inner_commit=hK_, inner_live=[NU, NT], inner_change=NC); return hK_
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
        st_, hC_, hM_, root = commit(pk, {bytes(16): hU, PP: hP, PF: hF}, PC, ops, None, {"actor": actor, "time": 1767312000000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 2014)
        NP.update(outer=st_, outer_commit=root, outer_live=[bytes(16), PP, PF], outer_change=PC)
        pk.index(); pk.head(root); return root, of
    both = Pack(); nested = child(both); of_nested = [r["hash"] for r in both.log]; root, of = parent(both, nested)
    alone = Pack(); alone.n = 1; root2, _ = parent(alone, nested)   # the veil counter continues as in the first file, so the records are the same
    return both, alone, nested, root, root2, of, of_nested
NP = {}
both, alone, nested, root, root2, of, of_nested = nested_pair()
assert root == root2
open(os.path.join(OUT, "nested.ufx"), "wb").write(both.b); open(os.path.join(OUT, "linked.ufx"), "wb").write(alone.b)
V["nested"] = {"nested_file": "nested.ufx", "nested_length": len(both.b), "linked_file": "linked.ufx", "linked_length": len(alone.b),
    "root_hash_of_both_files": root.hex(), "commit_named_by_the_anchor": nested.hex(), "portal_of_hex": enc(of).hex(),
    "records_reached_only_through_the_anchor": of_nested,
    "records_of_the_outer_universe": [r["hash"] for r in alone.log],
    "nested.ufx": "whole. The commit the anchor names is present, so the other universe is nested and each of its records is reachable through the anchor (section 1.3); compaction keeps them. The Portal presents the text 'Nested.'",
    "linked.ufx": "whole. The same universe, with the same root hash; the commit the anchor names is not in the file, so the other universe is linked. The Portal's target is unavailable and the reader shows its label (O4). Nothing is malformed.",
    "plain_text_face_of_nested.ufx": "A note from another universe:\n> Nested.",
    "plain_text_face_of_linked.ufx": "A note from another universe (ufo:" + nested.hex() + ")"}


# ---- 12. what travels (section 13.3): the layers of history.ufx, and a published copy holding the first two ----
def layers_of_history():
    nodes = []; object_map(sorted(state3.items()), out=nodes)
    content = {rhash(NODE, n) for n in nodes} | {state3[U], state3[F], state3[T]}      # the current object map; the live objects: universe, face, text
    attribution = {g["root"], hK2, hK3, state3[C1], state3[C2], state3[C3]}                # every commit; the changes that elements and `by` name
    history = set(hist_pk.recs) - content - attribution
    pub = Pack()
    for h, (kind, rec, codec) in hist_pk.recs.items():                                          # in the order they were first written
        if h in content or h in attribution: pub.put(kind, rec, codec)
    pub.raw(3, enc(dict(signed, signature=sig)))
    pub.raw(6, enc({"history": True}))
    pub.index(); pub.head(hK3)
    return content, attribution, history, pub
content, attribution, whist, pubpk = layers_of_history()
open(os.path.join(OUT, "published.ufx"), "wb").write(pubpk.b)
V["published"] = {"file": "published.ufx", "length": len(pubpk.b), "root_hash": hK3.hex(), "made_from": "history.ufx",
    "what": "history.ufx as it is published: the content and attribution layers, the seal, and an absent frame saying that working history is withheld. Working history is every other record of history.ufx",
    "content": sorted(h.hex() for h in content), "attribution": sorted(h.hex() for h in attribution), "working_history_records": len(whist),
    "content_is": "the nodes of the current object map, and the current revisions of the universe object, the face and the text. The clock and the forty items are not reachable from the universe object, so they are not live",
    "attribution_is": "the three commit nodes and the three change objects. Each change's work, and the opening of its veil, are working history",
    "a_reader_of_published.ufx": {"state": hK3.hex(), "plain_text_face": "Hello, world.!\n", "span_p1_resolves_to": [0, 14],
        "can": "verify the commit chain and the seal; find and read every live object; resolve every anchor; say which change wrote each character and its origin",
        "cannot": "replay any change: every work is withheld, and it reports them as withheld (E11), not as missing"}}
# ---- 10. a timeline: time edited as a sequence (section 4.5) ----
def timeline_pack():
    pk = Pack(); TU, TK, R1, R2, CAP, NOTE = bytes(16), bytes([0xe1]) * 16, bytes([0xe2]) * 16, bytes([0xe3]) * 16, bytes([0xe4]) * 16, bytes([0xe5]) * 16
    D1, D2, D3, D4 = (bytes([c]) * 16 for c in (0xd4, 0xd5, 0xd6, 0xd7)); lin = bytes([0x44]) * 16; S = FL
    def reg(a, b): return anchor({"o": TK, "a": {"t": ["s", a, b]}})
    plays = {"a": {"at": reg([D1, 0, 0], [D1, 6 * S - 1, 1]), "of": ref(R1)},
             "b": {"at": reg([D1, 6 * S, 0], "end"), "of": ref(R2), "offset": 2 * S},
             "c": {"at": reg([D1, 7 * S, 0], [D1, 8 * S - 1, 1]), "of": ref(CAP)}}
    marks = {"m1": reg([D1, 4 * S, 0], [D1, 5 * S - 1, 1]), "m2": reg([D1, 8 * S, 0], [D1, 9 * S - 1, 1]), "m3": reg([D1, 1 * S, 0], [D1, 6 * S - 1, 1])}
    cap = "A caption."; roots = {"primary": ref(TK)}
    pub = lambda t: {"actor": actor, "time": t, "origin": {"basis": "witnessed", "by": "person", "who": who}}
    st = {}; out = []
    def clock(rev, by, sl, count, seq, prev=None):
        return revision(pk, TK, "ufo.clock", rev, by, sl, {"start": 0, "rate": [1, 1], "t": count, "plays": plays}, prev=prev, seq={"t": seq})
    # commit 1: ten seconds of time, two plays end to end, a caption, three anchors held by a note object
    seq1 = [[D1, 0, 10 * S]]
    st[TU] = revision(pk, TU, "ufo.universe", 1, D1, 5001, {"lineage": lin, "roots": roots})
    st[TK] = clock(1, D1, 5002, 10 * S, seq1)
    st[R1] = revision(pk, R1, "ufo.raster", 1, D1, 5003, {"label": "first take"})
    st[R2] = revision(pk, R2, "ufo.raster", 1, D1, 5004, {"label": "second take"})
    st[CAP] = revision(pk, CAP, "ufo.text", 1, D1, 5005, {"chars": cap}, seq={"chars": [[D1, 10 * S, len(cap)]]})
    st[NOTE] = revision(pk, NOTE, "org.example.marks", 1, D1, 5006, {"marks": marks})
    ops = [{"op": "new", "obj": TU, "type": "ufo.universe"}, {"op": "set", "obj": TU, "key": "lineage", "val": lin},
           {"op": "new", "obj": TK, "type": "ufo.clock"}, {"op": "set", "obj": TK, "key": "start", "val": 0}, {"op": "set", "obj": TK, "key": "rate", "val": [1, 1]},
           {"op": "splice", "obj": TK, "key": "t", "after": None, "ins": 10 * S},
           {"op": "new", "obj": R1, "type": "ufo.raster"}, {"op": "set", "obj": R1, "key": "label", "val": "first take"},
           {"op": "new", "obj": R2, "type": "ufo.raster"}, {"op": "set", "obj": R2, "key": "label", "val": "second take"},
           {"op": "new", "obj": CAP, "type": "ufo.text"}, {"op": "splice", "obj": CAP, "key": "chars", "after": None, "ins": cap},
           {"op": "set", "obj": TK, "key": "plays", "val": plays},
           {"op": "new", "obj": NOTE, "type": "org.example.marks"}, {"op": "set", "obj": NOTE, "key": "marks", "val": marks},
           {"op": "set", "obj": TU, "key": "roots", "val": roots}]
    st, _, _, k1 = commit(pk, st, D1, ops, "Ten seconds.", pub(1767225600000), None, 0, 5007); pk.index(); pk.head(k1)
    # commit 2: seconds 3 and 4 are cut from the middle
    seq2 = [[D1, 0, 3 * S], [D1, 3 * S, 2 * S, False], [D1, 5 * S, 5 * S]]
    h1 = st[TK]; st = dict(st); st[TK] = clock(2, D2, 5011, 8 * S, seq2, prev=h1)
    ops = [{"op": "splice", "obj": TK, "key": "t", "del": [[D1, 3 * S, 2 * S]], "old": 2 * S}]
    st, _, _, k2 = commit(pk, st, D2, ops, "Cut two seconds from the middle.", pub(1767229200000), k1, 1, 5012); pk.index(); pk.head(k2)
    # commit 3: one second of new time is inserted inside the second play
    seq3 = [[D1, 0, 3 * S], [D1, 3 * S, 2 * S, False], [D1, 5 * S, 2 * S], [D3, 0, 1 * S], [D1, 7 * S, 3 * S]]
    h2 = st[TK]; st = dict(st); st[TK] = clock(3, D3, 5021, 9 * S, seq3, prev=h2)
    ops = [{"op": "splice", "obj": TK, "key": "t", "after": [D1, 7 * S - 1], "ins": 1 * S}]
    st, _, _, k3 = commit(pk, st, D3, ops, "One second inserted.", pub(1767232800000), k2, 2, 5013); pk.index(); pk.head(k3)
    # commit 4: the first second of the second play is cut; its time base is read from its anchor, so what remains plays as before
    seq4 = [[D1, 0, 3 * S], [D1, 3 * S, 2 * S, False], [D1, 5 * S, 1 * S], [D1, 6 * S, 1 * S, False], [D3, 0, 1 * S], [D1, 7 * S, 3 * S]]
    h3 = st[TK]; st = dict(st); st[TK] = clock(4, D4, 5031, 8 * S, seq4, prev=h3)
    ops = [{"op": "splice", "obj": TK, "key": "t", "del": [[D1, 6 * S, 1 * S]], "old": 1 * S}]
    st, _, _, k4 = commit(pk, st, D4, ops, "The start of the second take cut.", pub(1767236400000), k3, 3, 5032); pk.index(); pk.head(k4)
    def element_at(seq, p):
        for r in seq:
            if len(r) == 3:
                if p < r[2]: return r[0], r[1] + p
                p -= r[2]
        return None
    def inside(seq, at, p):
        r = resolve(seq, at[1], at[2]); return r != "detached" and r[0] <= p < r[1]
    def first(seq, b):       # the first element a region covers, from its start boundary
        return (b[0], b[1] + b[2])
    def playing(seq, p):
        e = element_at(seq, p); res = {}
        if e is None: return res
        for k, pl in sorted(plays.items()):
            at = pl["at"].v["a"]["t"]
            if not inside(seq, at, p): continue
            c0, n0 = first(seq, at[1])
            if e[0] == c0: res[k] = pl.get("offset", 0) + (e[1] - n0)
        return res
    commits = []
    for name, k, seq, count, samples in (("1", k1, seq1, 10 * S, [2 * S, 7 * S + S // 2]), ("2", k2, seq2, 8 * S, [2 * S, 3 * S, 4 * S, 5 * S + S // 2]),
                                         ("3", k3, seq3, 9 * S, [5 * S + S // 2, 6 * S + S // 2]),
                                         ("4", k4, seq4, 8 * S, [3 * S + S // 2, 4 * S, 5 * S + S // 2])):
        commits.append({"commit": k.hex(), "t": count, "seq": seqj(seq),
            "anchors": {m: resolve(seq, a.v["a"]["t"][1], a.v["a"]["t"][2]) for m, a in sorted(marks.items())},
            "plays_resolve_to": {m: resolve(seq, pl["at"].v["a"]["t"][1], pl["at"].v["a"]["t"][2]) for m, pl in sorted(plays.items())},
            "playing_at": [{"position": p, "element": [element_at(seq, p)[0].hex(), element_at(seq, p)[1]], "plays": playing(seq, p)} for p in samples]})
    TL.update(st=st, commits=[k1, k2, k3, k4], live=[TU, TK, R1, R2, CAP], changes=[D1, D3, D4], pk=pk)
    return pk, {"file": "timeline.ufx", "length": len(pk.b), "flicks_per_second": S, "clock": TK.hex(),
        "what": "a clock whose t is a count: ten seconds inserted by one change; then two seconds cut from the middle; then one second inserted by another change; then the first second of play b cut. Positions and times are in flicks",
        "plays": {"a": "seconds 0 to 6 as first inserted, playing the first take from its time 0", "b": "from second 6 to the end, playing the second take from its time 2 s", "c": "second 7, a caption"},
        "anchors": {"m1": "second 4: cut in commit 2, so detached from then on", "m2": "second 8: moves two seconds earlier after the cut, and one later after the insertion", "m3": "seconds 1 to 5: shortened by the cut"},
        "rule": "a play's region begins at the boundary [c, n, side]; n0 is n + side, read from the anchor whether or not those elements are still present. At an element numbered m by the same change c inside the region, the play's object is at time offset + (m - n0); at an element of another change it is not present",
        "commits": commits}
TL = {}
tpk, tv = timeline_pack()
open(os.path.join(OUT, "timeline.ufx"), "wb").write(tpk.b); V["timeline"] = tv

# ---- 11. a text with every block role, for composition, pagination and the plain-text face (sections 7.7, 8.3) ----
def compose_pack():
    pk = Pack(); CU, CT, CF, CP = bytes(16), bytes([0x71]) * 16, bytes([0x72]) * 16, bytes([0x73]) * 16; CC = bytes([0x7c]) * 16; lin = bytes([0x55]) * 16
    filler = ["Every figure in this section was taken from the ledger at the close of the quarter and has not been adjusted since.",
              "Where a number differs from the one reported last time, the difference is explained beside it and the earlier value is kept.",
              "Nothing here is a forecast. The next section says what the team expects, and why, and how sure it is.",
              "Readers who want the detail behind a line can open it: each row leads back to the entries it was summed from.",
              "The appendix lists what was left out and the reason for each omission, so that nothing is absent by accident.",
              "Corrections are welcome and are recorded with the name of whoever made them and the evidence they gave."]
    blocks = [("heading", {"level": 1}, "The Quarterly Review"),
              ("paragraph", {}, "Revenue grew in every region this quarter, and for the first time the growth came mostly from customers who had been with us for more than a year."),
              ("item", {"level": 1, "marker": "bullet"}, "First point, short."),
              ("item", {"level": 1, "marker": "bullet"}, "Second point, which runs long enough to need a second line at the width used here."),
              ("item", {"level": 2, "marker": "number"}, "A numbered step."),
              ("item", {"level": 2, "marker": "number"}, "Another numbered step."),
              ("item", {"level": 1, "marker": "bullet"}, "Third point."),
              ("quote", {}, "What gets measured gets managed, and what gets explained gets trusted."),
              ("code", {}, "total = sum(rows)\nprint(total)"),
              ("heading", {"level": 2}, "Method")] + [("paragraph", {}, f) for f in filler] + [("paragraph", {}, "")]
    chars = "".join(b[2] for b in blocks); spans = {}; at = 0
    def el(i): return [CC, i, 0]
    starts = []
    for b in blocks: starts.append(at); at += len(b[2])
    for i, (role, props, text) in enumerate(blocks):
        nxt = next((starts[j] for j in range(i + 1, len(blocks)) if starts[j] < len(chars)), None)
        a = el(starts[i]) if starts[i] < len(chars) else "end"
        e = el(nxt) if (nxt is not None and len(text)) else ("end" if len(text) or starts[i] >= len(chars) else el(starts[i]))
        spans["b%02d" % i] = dict({"at": anchor({"o": CT, "a": {"chars": ["s", a, e]}}), "kind": "block", "role": role}, **props)
    def inline(key, word, role, nth=0):
        i = chars.index(word); spans[key] = {"at": anchor({"o": CT, "a": {"chars": ["s", [CC, i, 0], [CC, i + len(word) - 1, 1]]}}), "kind": "inline", "role": role}
    inline("i0", "every region", "emphasis"); inline("i1", "for the first time", "strong")
    samp = {"page": [320.0, 400.0], "margins": [24.0, 24.0, 24.0, 24.0]}
    roots = {"primary": ref(CF)}; faces = [ref(CF), ref(CP)]
    tp = {"chars": chars, "spans": spans, "size": 16.0}
    st = {CU: revision(pk, CU, "ufo.universe", 1, CC, 6001, {"lineage": lin, "roots": roots, "faces": faces}),
          CT: revision(pk, CT, "ufo.text", 1, CC, 6002, tp, seq={"chars": [[CC, 0, len(chars)]]}),
          CF: revision(pk, CF, "ufo.face", 1, CC, 6003, {"of": ref(CT), "medium": "document"}),
          CP: revision(pk, CP, "ufo.face", 1, CC, 6004, {"of": ref(CT), "medium": "pages", "sampling": samp})}
    ops = [{"op": "new", "obj": CU, "type": "ufo.universe"}, {"op": "set", "obj": CU, "key": "lineage", "val": lin},
           {"op": "new", "obj": CT, "type": "ufo.text"}, {"op": "splice", "obj": CT, "key": "chars", "after": None, "ins": chars},
           {"op": "set", "obj": CT, "key": "spans", "val": spans}, {"op": "set", "obj": CT, "key": "size", "val": 16.0},
           {"op": "new", "obj": CF, "type": "ufo.face"}, {"op": "set", "obj": CF, "key": "of", "val": ref(CT)}, {"op": "set", "obj": CF, "key": "medium", "val": "document"},
           {"op": "new", "obj": CP, "type": "ufo.face"}, {"op": "set", "obj": CP, "key": "of", "val": ref(CT)}, {"op": "set", "obj": CP, "key": "medium", "val": "pages"}, {"op": "set", "obj": CP, "key": "sampling", "val": samp},
           {"op": "set", "obj": CU, "key": "roots", "val": roots}, {"op": "set", "obj": CU, "key": "faces", "val": faces}]
    st, _, _, k = commit(pk, st, CC, ops, None, {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 6005)
    pk.index(); pk.head(k)
    return pk, {"file": "compose.ufx", "length": len(pk.b), "root_hash": k.hex(), "text": CT.hex(),
                "blocks": [{"role": r, **pr, "characters": len(t)} for r, pr, t in blocks],
                "what": "one text holding a heading, a paragraph with emphasis and strong, bulleted items with two numbered items nested, a quote, code with a line break, a second heading, six paragraphs and an empty last paragraph; a document face and a face of pages 320 by 400 with margins of 24"}
cpk, cv = compose_pack()
open(os.path.join(OUT, "compose.ufx"), "wb").write(cpk.b); V["compose_pack"] = cv

# ---- 13. regions of every kind, and the digest's cases (sections 4.2 to 4.4, 5.2) ----
def pins_pack():
    pk = Pack(); PU, PT, PX, PY, PZ, PA, PK, K1, K2, PM = (bytes([c]) * 16 for c in (0, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99)); PC = bytes([0x9c]) * 16
    lin = bytes([0x66]) * 16; S = FL; chars = "Alpha.Beta gamma.Delta."
    def reg(a, b): return anchor({"o": PT, "a": {"chars": ["s", a, b]}})
    e = lambda i, side=0: [PC, i, side]
    spans = {"b0": {"at": reg(e(0), e(6)), "kind": "block", "role": "paragraph"},
             "b1": {"at": reg(e(6), e(6)), "kind": "block", "role": "paragraph"},          # an empty block: a point
             "b2": {"at": reg(e(6), e(17)), "kind": "block", "role": "paragraph"},
             "b3": {"at": reg(e(17), "end"), "kind": "block", "role": "paragraph"},
             "i0": {"at": reg(e(11), e(15, 1)), "kind": "inline", "role": "link", "href": anchor({"o": PY}), "org.example.see": ref(PX)}}
    data = b"0123456789abcdef"
    tp = {"chars": chars, "spans": spans}
    xp = {"label": "x", "of": anchor({"o": PY})}; yp = {"label": "y", "back": ref(PT)}; zp = {"label": "z", "n": 1, "snapshot": b"\x01\x02"}
    ap = {"bytes": pk.outside("b", data), "media": "text/plain"}
    kp = {"start": 2 * S, "end": 8 * S, "scales": {"t": [1, 1, -1 * S]}, "children": {"a": ref(K1), "b": ref(K2)}}
    k1p = {"start": 0, "end": 3 * S}; k2p = {"start": 4 * S, "end": 9 * S}
    c = lambda o, ax, lo, hi: anchor({"o": o, "a": {ax: ["c", lo, hi]}})
    marks = {"bytes_mid": c(PA, "bytes", 3, 7), "bytes_clip": c(PA, "bytes", 10, 999), "bytes_out": c(PA, "bytes", 900, 950), "bytes_end": c(PA, "bytes", 16, 20),
             "t_in": c(PK, "t", 4 * S, 6 * S), "t_clip": c(PK, "t", 0, 4 * S), "t_touch": c(PK, "t", 9 * S, 12 * S), "t_out": c(PK, "t", 10 * S, 12 * S),
             "unknown": c(PZ, "w", 1.5, 2.5), "keys": anchor({"o": PT, "a": {"spans": ["k", "b0", "nope", "i0"]}}), "kids": anchor({"o": PK, "a": {"children": ["k", "b", "zz"]}}),
             "point": reg(e(6), e(6)), "whole": anchor({"o": PX})}
    mp = {"marks": marks}; roots = {"primary": ref(PT), "marks": ref(PM), "clock": ref(PK), "asset": ref(PA), "z": ref(PZ)}
    objs = [(PU, "ufo.universe", {"lineage": lin, "roots": roots}), (PT, "ufo.text", tp), (PX, "org.example.thing", xp), (PY, "org.example.thing", yp), (PZ, "org.example.thing", zp),
            (PA, "ufo.asset", ap), (PK, "ufo.clock", kp), (K1, "ufo.clock", k1p), (K2, "ufo.clock", k2p), (PM, "org.example.marks", mp)]
    st = {}; ops = []
    for n, (i, ty, p) in enumerate(objs):
        st[i] = revision(pk, i, ty, 1, PC, 7001 + n, p, seq={"chars": [[PC, 0, len(chars)]]} if i == PT else None)
        ops.append({"op": "new", "obj": i, "type": ty})
        for k2_, v in p.items():
            ops.append({"op": "splice", "obj": i, "key": k2_, "after": None, "ins": v} if (i == PT and k2_ == "chars") else {"op": "set", "obj": i, "key": k2_, "val": v})
    st, _, _, k = commit(pk, st, PC, ops, None, {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 7050)
    pk.index(); pk.head(k)
    hx = lambda i: i.hex()
    resolves = {"bytes_mid": [3, 7], "bytes_clip": [10, 16], "bytes_out": "detached", "bytes_end": [16, 16],
                "t_in": [3 * S, 5 * S], "t_clip": [2 * S, 3 * S], "t_touch": [8 * S, 8 * S], "t_out": "detached",
                "unknown": {"unclipped": [1.5, 2.5]}, "keys": ["b0", "i0"], "kids": ["b"], "point": [6, 6], "whole": "the whole object"}
    def dg(name, why, sl, covered, followed, **pin):
        return dict(pin, case=name, why=why, salt=salt(sl).hex(), covered_value_hex=enc(covered).hex(),
                    followed=[{"id": i.hex(), "revision": st[i].hex()} for i in sorted(followed)], digest=digest(salt(sl), covered, [(i, st[i]) for i in followed]).hex())
    tk = {k_: v for k_, v in spans.items() if k_ in ("b0", "b2", "i0")}
    cases = [
        dg("a passage with spans", "the spans that share a present element with the passage are kept: b0, b2 and i0. The empty block b1 is a point and shares none; b3 lies outside. The ref in i0 is followed to x; x's `of` is followed to y; y refers back to the text, which is the pinned object and is never followed; the anchor in `href` is not a ref and not an `of`, and is not followed",
           7101, {"chars": ["Alpha.Beta gamma.", {"spans": tk}]}, [PX, PY], o=hx(PT), axis="chars", a=[hx(PC), 0, 0], b=[hx(PC), 16, 1]),
        dg("a passage one span touches", "only b3", 7102, {"chars": ["Delta.", {"spans": {"b3": spans["b3"]}}]}, [], o=hx(PT), axis="chars", a=[hx(PC), 17, 0], b="end"),
        dg("a point", "a point covers nothing and nothing touches it: the covered items are empty and the map is there, empty", 7103, {"chars": ["", {}]}, [], o=hx(PT), axis="chars", a=[hx(PC), 6, 0], b=[hx(PC), 6, 0]),
        dg("a whole object with a snapshot", "a property named snapshot is left out of the covered value", 7104, {"label": "z", "n": 1}, [], o=hx(PZ)),
        dg("keys", "the entries of the keys that are present, and nothing for the key that is not", 7105, {"spans": {"b0": spans["b0"]}}, [], o=hx(PT), axis="spans", keys=["b0", "nope"]),
        dg("a continuous region", "the covered value is the object's properties whole; both children are followed, whatever their intervals", 7106, {"t": kp}, [K1, K2], o=hx(PK), axis="t", low=4 * S, high=6 * S),
        dg("an asset's bytes", "continuous: the covered value is the asset's properties, with the bytes themselves", 7107, {"bytes": {"bytes": data, "media": "text/plain"}}, [], o=hx(PA), axis="bytes", low=3, high=7)]
    return pk, k, st, {"file": "pins.ufx", "length": len(pk.b), "root_hash": k.hex(), "marks_object": PM.hex(), "flicks_per_second": S,
        "what": "one commit holding a text with an empty block and an inline span, three small objects that refer to one another, an asset of sixteen bytes, a clock from second 2 to second 8 whose scale shifts t by minus one second, and an object whose `marks` holds an anchor of every kind",
        "extents": "the asset's bytes: [0, 16]. The clock's t: [start, end] = [2 s, 8 s], in present coordinates, after the scale. The object named by `unknown` is of a type this document does not define, so its axis w has no known extent",
        "anchors_resolve_to": resolves, "digests": cases}
ppk, pk_root, pst, pv = pins_pack()
open(os.path.join(OUT, "pins.ufx"), "wb").write(ppk.b); V["pins"] = pv
# the same rule on a count: a region of the timeline at its last commit
_S = FL; _D1 = bytes([0xd4]) * 16; _TK = bytes([0xe1]) * 16; _R1 = bytes([0xe2]) * 16
_play_a = {"at": anchor({"o": _TK, "a": {"t": ["s", [_D1, 0, 0], [_D1, 6 * _S - 1, 1]]}}), "of": ref(_R1)}
_cov = {"t": [[[_D1, 0, 3 * _S]], {"plays": {"a": _play_a}}]}
V["pins"]["digests"].append({"case": "three seconds of a timeline", "pack": "timeline.ufx", "why": "on a count the covered items are the runs the region covers, cut to it; play a touches them and plays b and c do not; the first take is followed",
    "o": _TK.hex(), "axis": "t", "a": [_D1.hex(), 0, 0], "b": [_D1.hex(), 3 * _S - 1, 1], "salt": salt(7108).hex(), "covered_value_hex": enc(_cov).hex(),
    "followed": [{"id": _R1.hex(), "revision": TL["st"][_R1].hex()}], "digest": digest(salt(7108), _cov, [(_R1, TL["st"][_R1])]).hex()})

# ---- 14. the layers of the other packs (section 2.5), and published copies of them ----
def map_hashes(state):
    nodes = []; object_map(sorted(state.items()), out=nodes); return {rhash(NODE, n) for n in nodes}
def publish(src, content, attribution, head_commit, name):
    pub = Pack()
    for h, (kind, rec, codec) in src.recs.items():
        if h in content or h in attribution: pub.put(kind, rec, codec)
    pub.raw(6, enc({"history": True})); pub.index(); pub.head(head_commit)
    open(os.path.join(OUT, name), "wb").write(pub.b); return len(pub.b)
def layer_vector(src, content, attribution, head_commit, name, content_is, attribution_is, reader):
    n = publish(src, content, attribution, head_commit, name)
    return {"made_from": name.replace("published-", ""), "file": name, "length": n, "root_hash": head_commit.hex(),
            "content": sorted(h.hex() for h in content), "attribution": sorted(h.hex() for h in attribution),
            "working_history_records": len(set(src.recs) - content - attribution), "content_is": content_is, "attribution_is": attribution_is, "a_reader_of_the_published_copy": reader}
_tl = TL; _c = map_hashes(_tl["st"]) | {_tl["st"][i] for i in _tl["live"]}; _a = set(_tl["commits"]) | {_tl["st"][i] for i in _tl["changes"]}
V["published_timeline"] = layer_vector(_tl["pk"], _c, _a, _tl["commits"][-1], "published-timeline.ufx",
    "the current object map; the universe object, the clock, the two takes and the caption. The object holding the marks is not reachable from the universe object and is not live",
    "the four commits; the changes d4, d6 and d7, which the clock's current revision names in `by` or in a run of `seq`. The change d5 only removed elements, so nothing present names it: it is working history, and its revision is withheld although its commit names it",
    {"can": "resolve every play and say what plays at every position, exactly as from the whole pack", "reports": "the revision of change d5 as withheld, not as damage: a commit's change may be absent where the change is not attributing (section 2.5)"})
_c = map_hashes(NP["outer"]) | {NP["outer"][i] for i in NP["outer_live"]} | map_hashes(NP["inner"]) | {NP["inner"][i] for i in NP["inner_live"]}
_a = {NP["outer_commit"], NP["inner_commit"], NP["outer"][NP["outer_change"]], NP["inner"][NP["inner_change"]]}
V["published_nested"] = layer_vector(both, _c, _a, NP["outer_commit"], "published-nested.ufx",
    "the outer universe's object map and its three live objects; and, because a live Portal's anchor names a commit that is present, the nested universe's object map, its universe object and its text",
    "both commits and both changes: the outer one, and the nested universe's own, so that who wrote the nested text can be said",
    {"can": "say who wrote 'Nested.': the change d1 of the nested universe, witnessed, by a person, Test Author", "plain_text_of_the_nested_text": "Nested."})
# the status of every group: kept by hand in vectors/STATUS.json, copied here so that each vector file states it
V = dict(status=json.load(open(os.path.join(OUT, "STATUS.json"))), **V)
json.dump(V, open(os.path.join(OUT, "vectors.json"), "w"), indent=1)
print("minimal.ufx", V["minimal_pack"]["length"], V["minimal_pack"]["root_hash"][:16],
      "| history.ufx", V["history_pack"]["length"], hK3.hex()[:16], "| objects at commit 2:", len(state2))
