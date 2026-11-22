#!/usr/bin/env python3
"""Generates the UFO conformance test vectors (SPEC.md, Appendix F).

This is conformance tooling, not a reader: it writes fixed examples by the
rules of SPEC.md sections 1, 2, 4.3 and 11 so that implementations can be
checked against known bytes. Run from this directory: python3 generate.py
"""
import hashlib, json, struct

def sha(b): return hashlib.sha256(b).digest()

class Tag:
    def __init__(self, n, v): self.n, self.v = n, v
def link(h): return Tag(55460, h)
def ref(i): return Tag(55461, i)
def anchor(m): return Tag(55462, m)

def head(major, n):
    if n < 24: return bytes([major << 5 | n])
    for ai, fmt in ((24, ">B"), (25, ">H"), (26, ">I"), (27, ">Q")):
        if n < 1 << (8 * struct.calcsize(fmt)):
            return bytes([major << 5 | ai]) + struct.pack(fmt, n)
    raise ValueError(n)

def enc(v):
    """Deterministic CBOR (RFC 8949, section 4.2.1)."""
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
    if isinstance(v, str):
        b = v.encode(); return head(3, len(b)) + b
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
def frame(kind, payload, codec=0): return bytes([kind, codec]) + leb(len(payload)) + payload

V = {}  # the vectors

# --- 1. values -------------------------------------------------------------
vals = [("null", None), ("true", True), ("int 0", 0), ("int 23", 23), ("int 24", 24),
        ("int -1", -1), ("int 2^32", 1 << 32), ("float 1.5", 1.5), ("float 0.1", 0.1),
        ("float 100000.0", 100000.0), ("text", "héllo"), ("bytes", b"\x00\xff"),
        ("list", [1, "a", [True]]),
        ("map sorted by encoded key", {"b": 1, "aa": 2, "a": 3}),
        ("link", link(bytes(32))), ("ref", ref(bytes(range(16)))),
        ("anchor", anchor({"o": bytes(range(16)), "a": {"chars": [0, 5]}})),
        ("formula", Tag(55463, ["+", 1, ["get", ref(bytes(16)), "w"]]))]
V["values"] = [{"name": n, "hex": enc(v).hex()} for n, v in vals]

# --- 2. record hashes --------------------------------------------------------
V["record_hashes"] = [
    {"kind": "chunk", "bytes_hex": b"abc".hex(), "hash": rhash(CHUNK, b"abc").hex()},
    {"kind": "node", "value": '{k: "val", v: "abc"}', "bytes_hex": enc({"k": "val", "v": "abc"}).hex(),
     "hash": rhash(NODE, enc({"k": "val", "v": "abc"})).hex()}]

# --- 3. blobs ----------------------------------------------------------------
MIB = 1 << 20
def blob_node(length, stream_sha, links):
    return enc({"k": "blob", "len": length, "sha256": stream_sha, "chunks": [link(h) for h in links]})
def blob_of_zeros(length):
    """Blob hash for `length` zero bytes, without materialising them all."""
    full = rhash(CHUNK, bytes(MIB)); n_full, rest = divmod(length, MIB)
    hashes = [full] * n_full + ([rhash(CHUNK, bytes(rest))] if rest else [])
    def stream_sha(nbytes):
        h = hashlib.sha256(); z = bytes(MIB)
        for _ in range(nbytes // MIB): h.update(z)
        h.update(bytes(nbytes % MIB)); return h.digest()
    def build(hs, nbytes, cover):  # cover = chunks covered by each entry of hs
        if len(hs) <= 1024: return blob_node(nbytes, stream_sha(nbytes), hs)
        groups = []
        for i in range(0, len(hs), 1024):
            g = hs[i:i + 1024]; glen = min(nbytes - i * cover * MIB, 1024 * cover * MIB)
            groups.append((rhash(NODE, blob_node(glen, stream_sha(glen), g))))
        return build(groups, nbytes, cover * 1024)
    return build(hashes, length, 1)
V["blobs"] = []
for name, data in (("empty", b""), ("abc", b"abc")):
    hs = [rhash(CHUNK, data)] if data else []
    node = blob_node(len(data), sha(data), hs)
    V["blobs"].append({"name": name, "node_hex": node.hex(), "blob_hash": rhash(NODE, node).hex()})
for name, n in (("2^20 zero bytes", MIB), ("2^20+1 zero bytes", MIB + 1), ("1025 MiB of zero bytes (two levels)", 1025 * MIB)):
    node = blob_of_zeros(n)
    V["blobs"].append({"name": name, "len": n, "node_hex": node.hex() if len(node) < 400 else None,
                       "blob_hash": rhash(NODE, node).hex()})

# --- 4. object maps ----------------------------------------------------------
def object_map(entries, depth=0, out=None):
    """entries: sorted list of (id, revision hash). Returns root hash; collects nodes in out."""
    if len(entries) <= 32:
        node = enc({"k": "map", "e": [[i, link(h)] for i, h in entries]})
    else:
        kids = {}
        for i, h in entries: kids.setdefault(i[depth], []).append((i, h))
        node = enc({"k": "map", "c": {"%02x" % b: link(object_map(es, depth + 1, out)) for b, es in kids.items()}})
    if out is not None: out.append(node)
    return rhash(NODE, node)
V["object_maps"] = []
for n in (1, 32, 33, 9000):
    es = sorted((sha(b"id" + struct.pack("<I", i))[:16], sha(b"rev" + struct.pack("<I", i))) for i in range(n))
    V["object_maps"].append({"entries": n, "rule": "id = SHA-256('id' || u32le(i))[:16], revision = SHA-256('rev' || u32le(i)), i = 0..n-1",
                             "root_hash": object_map(es).hex()})

# --- 5. a minimal pack -------------------------------------------------------
def salt(i): return sha(b"ufo-test-salt" + bytes([i]))[:16]
U, T, F, C = bytes(16), bytes([0xa1]) * 16, bytes([0xfa]) * 16, bytes([0xc1]) * 16
records = []  # (kind, bytes) in order written
def put(kind, b): records.append((kind, b)); return rhash(kind, b)
def sval(v, i): return link(put(NODE, enc({"k": "val", "v": v, "salt": salt(i)})))
def obj(i, typ, p, sl, runs=None):
    n = {"k": "obj", "id": i, "type": typ, "rev": 1, "by": C, "salt": salt(sl), "p": p}
    if runs: n["runs"] = runs
    return put(NODE, enc(n))
text = "Hello, universe."
span = {"at": anchor({"o": T, "a": {"chars": [0, len(text)]}}), "kind": "block", "role": "paragraph"}
roots, faces, feats = {"primary": ref(F)}, [ref(F)], {"ufo.text": {"v": 1, "required": True}}
lineage = bytes([0x11]) * 16
ops = [
    {"op": "new", "obj": U, "type": "ufo.universe"},
    {"op": "set", "obj": U, "key": "lineage", "val": sval(lineage, 1)},
    {"op": "new", "obj": T, "type": "ufo.text"},
    {"op": "splice", "obj": T, "key": "chars", "at": 0, "del": 0, "add": len(text), "ins": sval(text, 2)},
    {"op": "set", "obj": T, "key": ["spans", "p1"], "val": sval(span, 3)},
    {"op": "new", "obj": F, "type": "ufo.face"},
    {"op": "set", "obj": F, "key": "of", "val": sval(ref(T), 4)},
    {"op": "set", "obj": F, "key": "medium", "val": sval("document", 5)},
    {"op": "set", "obj": U, "key": "roots", "val": sval(roots, 6)},
    {"op": "set", "obj": U, "key": "faces", "val": sval(faces, 7)},
    {"op": "set", "obj": U, "key": "features", "val": sval(feats, 8)},
]
hU = obj(U, "ufo.universe", {"lineage": lineage, "roots": roots, "faces": faces, "features": feats}, 10)
hT = obj(T, "ufo.text", {"chars": text, "spans": {"p1": span}}, 11, runs={"chars": [[len(text), C, 0]]})
hF = obj(F, "ufo.face", {"of": ref(T), "medium": "document"}, 12)
who = {"name": "Test Author"}
change_p = {"ops": ops, "revs": {U.hex(): [None, hU], T.hex(): [None, hT], F.hex(): [None, hF]},
            "actor": {"who": who, "with": {"name": "ufo-vectors", "version": "0.4"}},
            "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who},
            "note": sval("First commit.", 9)}
hC = obj(C, "ufo.change", change_p, 13)
map_nodes = []
hM = object_map(sorted([(U, hU), (T, hT), (F, hF), (C, hC)]), out=map_nodes)
for n in map_nodes: put(NODE, n)
hK = put(NODE, enc({"k": "commit", "v": 1, "parents": [], "objects": link(hM), "change": link(hC), "height": 0}))

pack = bytearray(b"\x89UFO\r\n\x1a\n"); offsets = []
for kind, b in records:
    offsets.append((rhash(kind, b), len(pack))); pack += frame(kind, b)
index_at = len(pack)
entries = b"".join(h + struct.pack("<Q", o) for h, o in sorted(offsets))
pack += frame(4, struct.pack("<QQQ", len(offsets), 0, index_at) + entries)
body = hK + struct.pack("<QQQ", index_at, 0, len(pack) + 67)
head_frame = frame(5, body + sha(body)[:8]); assert len(head_frame) == 67
pack += head_frame
open("minimal.ufo", "wb").write(pack)
V["minimal_pack"] = {
    "file": "minimal.ufo", "length": len(pack), "sha256_of_file": sha(bytes(pack)).hex(),
    "root_hash": hK.hex(), "object_map_root": hM.hex(),
    "revisions": {"universe": hU.hex(), "text": hT.hex(), "face": hF.hex(), "change": hC.hex()},
    "identities": {"universe": U.hex(), "text": T.hex(), "face": F.hex(), "change": C.hex()},
    "records": [{"kind": "chunk" if k == CHUNK else "node", "offset": o, "hash": h.hex(), "hex": b.hex()}
                for (k, b), (h, o) in zip(records, offsets)],
    "index_offset": index_at, "head_hex": head_frame.hex(),
    "truncated_recovery": "remove the final byte: no valid head remains, so the file is malformed (step 3)",
    "hex": bytes(pack).hex()}

# --- 6. carrying a sequence region (section 4.3) -----------------------------
def carry(s, e, p, m, n, bias=None):
    was_empty = s == e
    s2 = s if s < p else (p + n if s < p + m else s + n - m)
    e2 = e if e <= p else (p if e <= p + m else e + n - m)
    if bias == "before" and m == 0 and e == p: e2 = p + n
    if bias == "after" and m == 0 and s == p: s2 = p
    if s2 > e2: s2 = e2
    return [s2, e2, "detached" if (s2 == e2 and not was_empty) else "attached"]
cases = [(5, 10, 0, 0, 3, None), (5, 10, 5, 0, 3, None), (5, 10, 10, 0, 3, None), (5, 10, 7, 0, 3, None),
         (5, 10, 3, 4, 1, None), (5, 10, 8, 4, 1, None), (5, 10, 5, 5, 2, None), (5, 10, 2, 20, 0, None),
         (5, 10, 6, 2, 9, None), (7, 7, 7, 0, 4, None), (7, 7, 5, 4, 0, None),
         (5, 10, 10, 0, 3, "before"), (5, 10, 5, 0, 3, "after"), (5, 10, 5, 0, 3, "before"), (5, 10, 10, 0, 3, "after")]
V["carry_sequence"] = [{"region": [s, e], "splice": {"at": p, "del": m, "add": n}, "bias_self_anchor": b,
                        "result": carry(s, e, p, m, n, b)} for s, e, p, m, n, b in cases]

# --- 7. printer and instrumentation (section 11) -----------------------------
def vec(items): return leb(len(items)) + b"".join(items)
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
unit_hash = sha(t_add + vec([]) + code_add)
export_hash = sha(name("add") + b"\x00" + K_ADD)
instr = module([t_add], [0], FUEL, [("add", 0, 0), ("ufo:fuel", 3, 0)], [vec([]) + charge(4) + code_add])
V["printer"] = {
    "operations": [
        {"op": "func.add", "key": K_ADD.hex(), "name": "add", "params": ["i32", "i32"], "results": ["i32"],
         "locals": [], "body": "local.get 0\nlocal.get 1\ni32.add"},
        {"op": "export.set", "key": K_EXP.hex(), "name": "add", "item": K_ADD.hex()}],
    "baseline": "an empty module", "wasm_hex": stored.hex(), "wasm_blob_chunk_hash": rhash(CHUNK, stored).hex(),
    "items": {K_ADD.hex(): {"kind": "func", "index": 0, "name": "add", "hash": unit_hash.hex(),
                            "hashed_bytes_hex": (t_add + vec([]) + code_add).hex()},
              K_EXP.hex(): {"kind": "export", "index": 0, "name": "add", "hash": export_hash.hex(),
                            "hashed_bytes_hex": (name("add") + b"\x00" + K_ADD).hex()}}}
t_div = functype([F64, F64], [F64]); code_div = b"\x20\x00\x20\x01\xa3\x0b"
canon = b"\x22\x02\x20\x02\x62\x04\x7c\x44" + struct.pack("<Q", 0x7ff8000000000000) + b"\x05\x20\x02\x0b"
stored_div = module([t_div], [0], [], [("div", 0, 0)], [vec([]) + code_div])
instr_div = module([t_div], [0], FUEL, [("div", 0, 0), ("ufo:fuel", 3, 0)],
                   [vec([b"\x01" + F64]) + charge(4) + b"\x20\x00\x20\x01\xa3" + canon + b"\x0b"])
t_loop = functype([I32], [])  # (func (param i32) (loop (local.get 0) (i32.const 1) (i32.sub) (local.tee 0) (br_if 0)))
code_loop = b"\x03\x40\x20\x00\x41\x01\x6b\x22\x00\x0d\x00\x0b\x0b"
stored_loop = module([t_loop], [0], [], [("spin", 0, 0)], [vec([]) + code_loop])
instr_loop = module([t_loop], [0], FUEL, [("spin", 0, 0), ("ufo:fuel", 3, 0)],
                    [vec([]) + charge(2) + b"\x03\x40" + charge(6) + b"\x20\x00\x41\x01\x6b\x22\x00\x0d\x00\x0b\x0b"])
V["instrumentation"] = [
    {"name": "add: one entry region of 4 instructions", "stored_hex": stored.hex(), "instrumented_hex": instr.hex(),
     "behaviour": "with ufo:fuel = 4, add(2, 3) returns 5 and leaves 0; with ufo:fuel = 3 it traps out of fuel"},
    {"name": "div: NaN canonicalisation after f64.div", "stored_hex": stored_div.hex(), "instrumented_hex": instr_div.hex(),
     "behaviour": "div(0.0, 0.0) returns the bits 0x7ff8000000000000"},
    {"name": "spin: entry region of 2 (loop, final end), loop region of 6",
     "stored_hex": stored_loop.hex(), "instrumented_hex": instr_loop.hex(),
     "behaviour": "spin(3) consumes 2 + 3*6 = 20; with ufo:fuel = 19 it traps out of fuel on entering the third iteration"}]

json.dump(V, open("vectors.json", "w"), indent=1)
print("wrote vectors.json and minimal.ufo:", len(pack), "bytes, root", hK.hex())
