#!/usr/bin/env python3
"""Generates the UFO conformance test vectors (SPEC.md, Appendix F).

NON-NORMATIVE. The specification and the files in vectors/ are normative;
this script is not. If it disagrees with either, this script is wrong.

It is not a reader, a writer or a library. Nothing may import it or depend
on it, and it must not grow into one: the kernel, when it exists, must
reproduce every vector on its own, without reference to this file.

Run from the repository root: python3 tools/vectors/generate.py [--slow]
It rewrites vectors/vectors.json, vectors/minimal.ufx and vectors/history.ufx.
--slow also computes the blob vector that hashes one tebibyte (minutes).
"""
import hashlib, json, os, struct, sys, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "vectors")
def sha(b): return hashlib.sha256(b).digest()

# ---- deterministic CBOR (RFC 8949, section 4.2.1) -----------------------------
class Tag:
    def __init__(self, n, v): self.n, self.v = n, v
def link(h): return Tag(55460, h)
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
        ("link", link(bytes(32))), ("ref", ref(bytes(range(16)))),
        ("anchor", anchor({"o": bytes(range(16)), "a": {"chars": ["s", 0, 5]}})),
        ("formula", Tag(55463, ["+", 1, ["get", ref(bytes(16)), "w"]])),
        ("indirect", Tag(55464, bytes([0xee]) * 32))]
def describe(v):
    if isinstance(v, Tag): return {"tag": {55460: "link", 55461: "ref", 55462: "anchor", 55463: "formula", 55464: "indirect"}[v.n], "of": describe(v.v)}
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
    ("link tag on 31 bytes", "d9d8a4581f" + "00" * 31), ("non-text map key", "a10101"),
    ("simple value 16", "f0"), ("invalid UTF-8", "62c328"))]

# ---- 2. record hashes -----------------------------------------------------------
V["record_hashes"] = [
    {"kind": "chunk", "bytes_hex": b"abc".hex(), "hash": rhash(CHUNK, b"abc").hex()},
    {"kind": "node", "value": '{k: "val", v: "abc"}', "bytes_hex": enc({"k": "val", "v": "abc"}).hex(),
     "hash": rhash(NODE, enc({"k": "val", "v": "abc"})).hex()}]

# ---- 3. blobs -------------------------------------------------------------------
MIB = 1 << 20
def blob_node(length, stream_sha, links):
    return enc({"k": "blob", "len": length, "sha256": stream_sha, "chunks": [link(h) for h in links]})
_zsha = {}
def zeros_sha(n):
    if n not in _zsha:
        h = hashlib.sha256(); z = bytes(MIB)
        for _ in range(n // MIB): h.update(z)
        h.update(bytes(n % MIB)); _zsha[n] = h.digest()
    return _zsha[n]
def zeros_blob(n):
    """Blob node for n zero bytes (section 1.4), without holding them in memory."""
    chunks = -(-n // MIB)
    if chunks <= 1024:
        hs = [rhash(CHUNK, bytes(MIB))] * (n // MIB) + ([rhash(CHUNK, bytes(n % MIB))] if n % MIB else [])
        return blob_node(n, zeros_sha(n), hs)
    span = 1024
    while -(-chunks // span) > 1024: span *= 1024
    parts, left = [], n
    while left > 0:
        take = min(left, span * MIB); parts.append(rhash(NODE, zeros_blob(take))); left -= take
    return blob_node(n, zeros_sha(n), parts)
V["blobs"] = []
for name, data in (("empty", b""), ("abc", b"abc")):
    node = blob_node(len(data), sha(data), [rhash(CHUNK, data)] if data else [])
    V["blobs"].append({"name": name, "len": len(data), "node_hex": node.hex(), "blob_hash": rhash(NODE, node).hex()})
sizes = [("2^20 zero bytes", MIB), ("2^20+1 zero bytes", MIB + 1), ("1025 MiB of zero bytes: two spans of 1024 chunks, the second holding one", 1025 * MIB)]
if "--slow" in sys.argv:
    h = hashlib.sha256(); z = bytes(MIB)                       # one pass for both stream hashes
    for _ in range(1 << 20): h.update(z)
    _zsha[1 << 40] = h.copy().digest(); h.update(z); _zsha[(1 << 40) + MIB] = h.digest()
    sizes.append(("2^40+2^20 zero bytes: spans of 1024^2 chunks, the second being a one-chunk blob", (1 << 40) + MIB))
_prior = []
if "--slow" not in sys.argv:        # keep the slow vector already computed, so a normal run does not drop it
    try: _prior = [b for b in json.load(open(os.path.join(OUT, "vectors.json")))["blobs"] if b.get("len", 0) >= 1 << 40]
    except (OSError, ValueError, KeyError): pass
for name, n in sizes:
    node = zeros_blob(n)
    V["blobs"].append({"name": name, "len": n, "node_hex": node.hex() if len(node) < 400 else None, "blob_hash": rhash(NODE, node).hex()})

V["blobs"] += _prior

# ---- 4. object maps ---------------------------------------------------------------
def object_map(entries, depth=0, out=None):
    if len(entries) <= 32:
        node = enc({"k": "map", "e": [[i, link(h)] for i, h in entries]})
    else:
        kids = {}
        for i, h in entries: kids.setdefault(i[depth], []).append((i, h))
        node = enc({"k": "map", "c": {"%02x" % b: link(object_map(es, depth + 1, out)) for b, es in kids.items()}})
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
        self.head_at = 0; self.covered = 8; self.index_sizes = []; self.log = []; self.n = 0
    def put(self, kind, rec, codec=0):
        h = rhash(kind, rec)
        if h not in self.off:
            self.off[h] = len(self.b); self.pending.append(h)
            self.log.append({"kind": "chunk" if kind == CHUNK else "node", "codec": codec, "offset": len(self.b), "hash": h.hex(),
                             "hex": rec.hex() if len(rec) <= 600 else None})
            self.b += frame(kind, rec, codec)
        return h
    def node(self, v, codec=0): return self.put(NODE, enc(v), codec)
    def sval(self, v):
        self.n += 1; return link(self.node({"k": "val", "v": v, "salt": salt(self.n)}))
    def raw(self, kind, payload): self.b += frame(kind, payload)
    def index(self):
        ents = sorted((h, self.off[h]) for h in self.pending); prev = self.index_at
        if self.index_sizes and self.index_sizes[-1][1] <= 2 * len(ents):       # merge rule, section 2.4
            prev_ents, _, prevprev = self.index_sizes.pop(); ents = sorted(ents + prev_ents); prev = prevprev
        at = len(self.b)
        self.raw(4, struct.pack("<QQQ", len(ents), prev, at) + b"".join(h + struct.pack("<Q", o) for h, o in ents))
        self.index_sizes.append((ents, len(ents), prev)); self.index_at = at; self.pending = []; self.covered = at
    def head(self, commit):
        body = commit + struct.pack("<QQQQ", self.off[commit], self.index_at, self.head_at, len(self.b) + 75)
        f = frame(5, body + sha(body)[:8]); assert len(f) == 75
        self.head_at = len(self.b); self.b += f; return f

def revision(pk, i, typ, rev, by, sl, p, prev=None, runs=None, codec=0):
    n = {"k": "obj", "id": i, "type": typ, "rev": rev, "by": by, "salt": salt(sl), "p": p}
    if prev: n["prev"] = link(prev)
    if runs: n["runs"] = runs
    return pk.node(n, codec)
def commit(pk, state, change_id, change_p, parent, height, sl):
    hC = revision(pk, change_id, "ufo.change", 1, change_id, sl, change_p)
    state = dict(state); state[change_id] = hC
    nodes = []; hM = object_map(sorted(state.items()), out=nodes)
    for n in nodes: pk.put(NODE, n)
    hK = pk.node({"k": "commit", "v": 1, "parents": [link(parent)] if parent else [], "objects": link(hM), "change": link(hC), "height": height})
    return state, hC, hM, hK

U, T, F = bytes(16), bytes([0xa1]) * 16, bytes([0xfa]) * 16
C1, C2, C3 = (bytes([c]) * 16 for c in (0xc1, 0xc2, 0xc3))
A, K = bytes([0xaa]) * 16, bytes([0xcc]) * 16
who = {"name": "Test Author"}; actor = {"who": who, "with": {"name": "ufo-vectors", "version": "0.4"}}
lineage = bytes([0x11]) * 16
def span(a, b): return {"at": anchor({"o": T, "a": {"chars": ["s", a, b]}}), "kind": "block", "role": "paragraph"}
roots, faces, feats = {"primary": ref(F)}, [ref(F)], {"ufo.text": {"v": 1, "required": True}}

def genesis(pk):
    t0 = "Hello, universe."
    ops = [{"op": "new", "obj": U, "type": "ufo.universe"},
           {"op": "set", "obj": U, "key": "lineage", "val": pk.sval(lineage)},
           {"op": "new", "obj": T, "type": "ufo.text"},
           {"op": "splice", "obj": T, "key": "chars", "at": 0, "del": 0, "add": len(t0), "ins": pk.sval(t0)},
           {"op": "set", "obj": T, "key": ["spans", "p1"], "val": pk.sval(span(0, 16))},
           {"op": "new", "obj": F, "type": "ufo.face"},
           {"op": "set", "obj": F, "key": "of", "val": pk.sval(ref(T))},
           {"op": "set", "obj": F, "key": "medium", "val": pk.sval("document")},
           {"op": "set", "obj": U, "key": "roots", "val": pk.sval(roots)},
           {"op": "set", "obj": U, "key": "faces", "val": pk.sval(faces)},
           {"op": "set", "obj": U, "key": "features", "val": pk.sval(feats)}]
    hU = revision(pk, U, "ufo.universe", 1, C1, 1001, {"lineage": lineage, "roots": roots, "faces": faces, "features": feats})
    hT = revision(pk, T, "ufo.text", 1, C1, 1002, {"chars": t0, "spans": {"p1": span(0, 16)}}, runs={"chars": [[16, C1, 0]]})
    hF = revision(pk, F, "ufo.face", 1, C1, 1003, {"of": ref(T), "medium": "document"})
    cp = {"ops": ops, "revs": {U.hex(): [None, hU], T.hex(): [None, hT], F.hex(): [None, hF]}, "actor": actor,
          "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}, "note": pk.sval("First commit.")}
    state, hC, hM, hK = commit(pk, {U: hU, T: hT, F: hF}, C1, cp, None, 0, 1004)
    pk.index(); hd = pk.head(hK)
    return state, dict(root=hK, map=hM, change=hC, universe=hU, text=hT, face=hF, head=hd)

# minimal.ufx: one commit
pk = Pack(); _, g = genesis(pk)
open(os.path.join(OUT, "minimal.ufx"), "wb").write(pk.b)
V["minimal_pack"] = {"file": "minimal.ufx", "length": len(pk.b), "sha256_of_file": sha(bytes(pk.b)).hex(),
    "root_hash": g["root"].hex(), "object_map_root": g["map"].hex(),
    "revisions": {"universe": g["universe"].hex(), "text": g["text"].hex(), "face": g["face"].hex(), "change": g["change"].hex()},
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "change": C1.hex()},
    "records": pk.log, "index_offset": pk.index_at, "head_hex": g["head"].hex(), "hex": bytes(pk.b).hex(),
    "state_after_removing_last_byte": "no valid head: no commit was ever completed; malformed (section 2.3, step 3)"}

# history.ufx: three commits, exercising what minimal.ufx does not
pk = Pack(); state, g = genesis(pk); len1 = len(pk.b)
pk.raw(0x7f, b"a frame of unknown kind: skipped and preserved")
# commit 2: a model replaces a word; a property is replaced; an asset, a clock and 40 small objects appear
t1 = "Hello, world."
data = (b"The quick brown fox jumps over the lazy dog.\n" * 120)[:5000]
hChunk = pk.put(CHUNK, data, codec=1)
hBlob = pk.put(NODE, blob_node(len(data), sha(data), [hChunk]))
FL = 705600000
items = [(sha(b"item" + struct.pack("<I", i))[:16], i) for i in range(40)]
ops = [{"op": "splice", "obj": T, "key": "chars", "at": 7, "del": 8, "add": 5, "old": pk.sval("universe"), "ins": pk.sval("world")},
       {"op": "set", "obj": F, "key": "medium", "old": pk.sval("document"), "val": pk.sval("text")},
       {"op": "new", "obj": A, "type": "ufo.asset"},
       {"op": "set", "obj": A, "key": "bytes", "val": pk.sval(link(hBlob))},
       {"op": "set", "obj": A, "key": "media", "val": pk.sval("text/plain")},
       {"op": "new", "obj": K, "type": "ufo.clock"},
       {"op": "set", "obj": K, "key": "start", "val": pk.sval(0)},
       {"op": "set", "obj": K, "key": "end", "val": pk.sval(10 * FL)}]
for i, n in items:
    ops += [{"op": "new", "obj": i, "type": "io.example.item"}, {"op": "set", "obj": i, "key": "n", "val": pk.sval(n)}]
LONG = "out of line " * 20
ops.append({"op": "set", "obj": items[0][0], "key": "long", "val": pk.sval(LONG)})
hLong = pk.node({"k": "val", "v": LONG})
hT2 = revision(pk, T, "ufo.text", 2, C2, 2001, {"chars": t1, "spans": {"p1": span(0, 13)}}, prev=state[T],
               runs={"chars": [[7, C1, 0], [5, C2, 0], [1, C1, 15]]}, codec=1)
hF2 = revision(pk, F, "ufo.face", 2, C2, 2002, {"of": ref(T), "medium": "text"}, prev=state[F])
hA = revision(pk, A, "ufo.asset", 1, C2, 2003, {"bytes": link(hBlob), "media": "text/plain"})
hK2o = revision(pk, K, "ufo.clock", 1, C2, 2004, {"start": 0, "end": 10 * FL})
revs = {T.hex(): [state[T], hT2], F.hex(): [state[F], hF2], A.hex(): [None, hA], K.hex(): [None, hK2o]}
st = dict(state); st.update({T: hT2, F: hF2, A: hA, K: hK2o})
for n_, (i, n) in enumerate(items):
    props = {"n": n}
    if n_ == 0: props["long"] = Tag(55464, hLong)        # stored out of line: an indirect
    st[i] = revision(pk, i, "io.example.item", 1, C2, 2100 + n_, props); revs[i.hex()] = [None, st[i]]
cp = {"ops": ops, "revs": revs, "actor": actor, "time": 1767229200000,
      "origin": {"basis": "witnessed", "by": "model", "model": "example-model-1", "asked": who}, "note": pk.sval("Shorter greeting.")}
state2, hC2, hM2, hK2 = commit(pk, st, C2, cp, g["root"], 1, 2005)
pk.index(); pk.head(hK2); len2 = len(pk.b)
key = ed_keys(SK)[2]; signed = {"commit": hK2, "key": key, "time": 1767229260000, "name": "Test Author"}
sig = ed_sign(SK, b"ufo-seal-1" + sha(enc(signed)))
pk.raw(3, enc(dict(signed, signature=sig))); pk.head(hK2); len2s = len(pk.b)
# commit 3: a person appends a character at a span's end with bias "before", trims the clock, drops the asset, accepts commit 2
t2 = "Hello, world.!"
ops = [{"op": "splice", "obj": T, "key": "chars", "at": 13, "del": 0, "add": 1, "bias": "before", "ins": pk.sval("!")},
       {"op": "splice", "obj": T, "key": "chars", "at": 14, "del": 0, "add": 1, "ins": pk.sval("?")},   # no bias: not joined to the span
       {"op": "splice", "obj": T, "key": "chars", "at": 14, "del": 1, "add": 0, "old": pk.sval("?")},   # a splice that only deletes
       {"op": "set", "obj": K, "key": "end", "old": pk.sval(10 * FL), "val": pk.sval(8 * FL)},
       {"op": "remap", "obj": K, "axis": "t", "scale": [1, 1], "shift": -2 * FL, "extent": [0, 8 * FL]},
       {"op": "drop", "obj": A}]
hT3 = revision(pk, T, "ufo.text", 3, C3, 3001, {"chars": t2, "spans": {"p1": span(0, 14)}}, prev=hT2,
               runs={"chars": [[7, C1, 0], [5, C2, 0], [1, C1, 15], [1, C3, 0]]})
hK3o = revision(pk, K, "ufo.clock", 2, C3, 3002, {"start": 0, "end": 8 * FL}, prev=hK2o)
st = dict(state2); st.update({T: hT3, K: hK3o}); del st[A]
cp = {"ops": ops, "revs": {T.hex(): [hT2, hT3], K.hex(): [hK2o, hK3o], A.hex(): [hA, None]}, "actor": actor, "time": 1767232800000,
      "origin": {"basis": "witnessed", "by": "person", "who": who},
      "decisions": [{"about": ref(C2), "verdict": "accept", "who": who}]}
state3, hC3, hM3, hK3 = commit(pk, st, C3, cp, hK2, 2, 3003)
pk.index(); pk.head(hK3)
open(os.path.join(OUT, "history.ufx"), "wb").write(pk.b)
V["history_pack"] = {"file": "history.ufx", "length": len(pk.b), "sha256_of_file": sha(bytes(pk.b)).hex(),
    "commits": [
        {"height": 0, "root_hash": g["root"].hex(), "object_map_root": g["map"].hex(), "objects": 4, "pack_length_at_first_head": len1,
         "text": "Hello, universe.", "span_p1": [0, 16], "runs": [[16, C1.hex(), 0]]},
        {"height": 1, "root_hash": hK2.hex(), "object_map_root": hM2.hex(), "objects": len(state2), "pack_length_at_first_head": len2,
         "text": t1, "span_p1": [0, 13], "runs": [[7, C1.hex(), 0], [5, C2.hex(), 0], [1, C1.hex(), 15]],
         "text_revision": hT2.hex(), "change_revision": hC2.hex(), "note": "its object map has an interior node; one node frame and the chunk frame use codec 1"},
        {"height": 2, "root_hash": hK3.hex(), "object_map_root": hM3.hex(), "objects": len(state3), "pack_length_at_first_head": len(pk.b),
         "text": t2, "span_p1": [0, 14], "runs": [[7, C1.hex(), 0], [5, C2.hex(), 0], [1, C1.hex(), 15], [1, C3.hex(), 0]],
         "text_revision": hT3.hex(), "change_revision": hC3.hex(), "note": "the asset is dropped: absent from this map, present in the previous one"}],
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "asset": A.hex(), "clock": K.hex(),
                   "changes": [C1.hex(), C2.hex(), C3.hex()]},
    "blob": {"hash": hBlob.hex(), "len": len(data), "sha256": sha(data).hex(), "chunk_hash": hChunk.hex()},
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
    "where_to_find": "the text is property chars of the text object; its span is spans.p1.at; the blob is property bytes of the asset; the clock's axis t has extent [start, end]",
    "anchors_carried": [
        {"anchor": {"o": T.hex(), "r": g["text"].hex(), "a": {"chars": ["s", 7, 15]}}, "to_revision": hT3.hex(), "result": "detached"},
        {"anchor": {"o": T.hex(), "r": g["text"].hex(), "a": {"chars": ["s", 0, 5]}}, "to_revision": hT3.hex(), "result": ["s", 0, 5]},
        {"anchor": {"o": T.hex(), "r": g["text"].hex(), "a": {"chars": ["s", 15, 16]}}, "to_revision": hT3.hex(), "result": ["s", 12, 13]},
        {"anchor": {"o": T.hex(), "r": hT2.hex(), "a": {"chars": ["s", 0, 13]}}, "to_revision": hT3.hex(), "result": ["s", 0, 13],
         "note": "not a self-anchor, so bias does not extend it"},
        {"anchor": {"o": K.hex(), "r": hK2o.hex(), "a": {"t": ["c", 3 * FL, 5 * FL]}}, "to_revision": hK3o.hex(), "result": ["c", 1 * FL, 3 * FL]},
        {"anchor": {"o": K.hex(), "r": hK2o.hex(), "a": {"t": ["c", 0, 3 * FL]}}, "to_revision": hK3o.hex(), "result": ["c", 0, 1 * FL],
         "note": "clipped to the extent the remap states"},
        {"anchor": {"o": K.hex(), "r": hK2o.hex(), "a": {"t": ["c", 0, 1 * FL]}}, "to_revision": hK3o.hex(), "result": "detached",
         "note": "left wholly outside the extent"},
        {"anchor": {"o": A.hex(), "r": hA.hex()}, "to_revision": None, "result": "detached", "note": "the object was dropped"}]}

# ---- 7. carrying a sequence region (section 4.3) ---------------------------------------
def carry(s, e, p, m, n, bias=None):
    had = s != e
    s2 = s if s < p else (p + n if s < p + m else s + n - m)
    e2 = e if e <= p else (p if e <= p + m else e + n - m)
    if bias == "before" and m == 0 and e == p: e2 = p + n
    if bias == "after" and m == 0 and s == p: s2 = p
    if s2 > e2: s2 = e2
    return [s2, e2, "detached" if (s2 == e2 and had) else "attached"]
cases = [(5, 10, 0, 0, 3, None), (5, 10, 5, 0, 3, None), (5, 10, 10, 0, 3, None), (5, 10, 7, 0, 3, None),
         (5, 10, 3, 4, 1, None), (5, 10, 8, 4, 1, None), (5, 10, 5, 5, 2, None), (5, 10, 2, 20, 0, None),
         (5, 10, 6, 2, 9, None), (7, 7, 7, 0, 4, None), (7, 7, 5, 4, 0, None),
         (5, 10, 10, 0, 3, "before"), (5, 10, 5, 0, 3, "after"), (5, 10, 5, 0, 3, "before"), (5, 10, 10, 0, 3, "after")]
V["carry_sequence"] = [{"region": [s, e], "splice": {"at": p, "del": m, "add": n}, "self_anchor": b is not None,
                        "bias": b, "result": carry(s, e, p, m, n, b)} for s, e, p, m, n, b in cases]
V["carry_continuous"] = [
    {"region": [10, 20], "remap": {"scale": [1, 1], "shift": -5, "extent": [0, 100]}, "result": [5, 15, "attached"]},
    {"region": [10, 21], "remap": {"scale": [1, 2], "shift": 0, "extent": [0, 100]}, "result": [5, 10, "attached"], "note": "integers: 21/2 rounds toward negative infinity"},
    {"region": [-7, 9], "remap": {"scale": [1, 2], "shift": 0, "extent": [-100, 100]}, "result": [-4, 4, "attached"], "note": "-7/2 is -4"},
    {"region": [10, 20], "remap": {"scale": [3, 1], "shift": 0, "extent": [0, 40]}, "result": [30, 40, "attached"], "note": "clipped"},
    {"region": [10, 20], "remap": {"scale": [1, 1], "shift": 50, "extent": [0, 40]}, "result": "detached"},
    {"region": [1.5, 2.5], "remap": {"scale": [3, 2], "shift": 0.25, "extent": [0.0, 10.0]}, "result": [2.5, 4.0, "attached"], "note": "floats"}]

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

json.dump(V, open(os.path.join(OUT, "vectors.json"), "w"), indent=1)
print("minimal.ufx", V["minimal_pack"]["length"], V["minimal_pack"]["root_hash"][:16],
      "| history.ufx", V["history_pack"]["length"], hK3.hex()[:16], "| objects at commit 2:", len(state2))
