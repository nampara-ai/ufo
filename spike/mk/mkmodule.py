"""Throwaway: turns a trial program (the second printer's state) into a described module in a pack:
a module object, one object per function, each body a sequence of statements with element identities."""
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from writer import *
st = json.load(open(sys.argv[1])); out = sys.argv[2]
def ident(s): return sha(b"spike-module" + s.encode())[:16]
M, U = ident("module"), bytes(16)
fid = {f["name"]: ident("func " + f["name"]) for f in st["funcs"]}
cid = lambda n: ident("change %d" % n)
def tree(s):
    if isinstance(s, list):
        if s and s[0] == "call": return ["call", ref(fid[s[1]])] + [tree(x) for x in s[2:]]
        return [tree(x) for x in s]
    if isinstance(s, dict): return {k: tree(v) for k, v in s.items()}
    return s
pk = Pack(); state = {}; n = 0; last = max(st["changes"], 1)
for f in st["funcs"]:
    runs = []
    for e in f["body"]:
        c, k = cid(e["id"][0]), e["id"][1]
        if runs and runs[-1][0] == c and runs[-1][1] + runs[-1][2] == k: runs[-1][2] += 1
        else: runs.append([c, k, 1])
    p = {"name": f["name"], "params": [[a, b] for a, b in zip(f["paramNames"], f["params"])], "results": f["results"],
         "locals": [[a, b] for a, b in zip(f["localNames"], f["locals"])], "body": [tree(e["s"]) for e in f["body"]]}
    n += 1; state[fid[f["name"]]] = revision(pk, fid[f["name"]], "ufo.func", len(f["history"]), cid(f["by"]), n, p, seq={"body": runs})
exports = {e["name"]: ("memory" if e["item"] == "memory" else ref(fid[e["item"]])) for e in st["exports"]}
mp = {"funcs": [ref(fid[f["name"]]) for f in st["funcs"]], "globals": {g["name"]: {"type": g["type"], "mutable": g["mutable"], "init": g["init"]} for g in st["globals"]},
      "memory": {"initial": st["memory"]["initial"], "maximum": st["memory"]["maximum"]}, "exports": exports}
state[M] = revision(pk, M, "ufo.module", 1, cid(last), 900, mp)
state[U] = revision(pk, U, "ufo.universe", 1, cid(last), 901, {"lineage": bytes([0x33]) * 16, "roots": {"primary": ref(M)}})
_, _, _, root = commit(pk, state, cid(last), [], "module as description", {"actor": {"who": {"name": "spike"}, "with": {"name": "ufo-spike", "version": "0"}}, "time": 0}, None, 0, 902)
pk.index(); pk.head(root); open(out, "wb").write(pk.b)
desc = sum(len(enc({"p": 0})) for _ in [0])
body_bytes = sum(len(enc([tree(e["s"]) for e in f["body"]])) for f in st["funcs"])
print(json.dumps({"pack": len(pk.b), "module_id": M.hex(), "functions": len(st["funcs"]), "statements": sum(len(f["body"]) for f in st["funcs"]),
                  "bodies_as_values": body_bytes, "bodies_deflated": len(deflate(b"".join(enc([tree(e["s"]) for e in f["body"]]) for f in st["funcs"]))),
                  "canonical_global_order": sorted([g["name"] for g in st["globals"]], key=lambda s: (len(s.encode()), s.encode()))}))
