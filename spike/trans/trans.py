"""Throwaway: transmutation in miniature. A derived object records what it was made from (pins),
and the change that made it records how (model, prompt, parameters). Staleness is computed from
digests by the rule of SPEC 4.4; `refresh` repeats the recipe in one step."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mk"))
from writer import enc, sha, Tag, ref, anchor
def ident(s): return sha(b"trans" + s.encode())[:16]
class Universe:
    def __init__(s): s.objs = {}; s.revs = {}; s.changes = {}; s.n = 0; s.history = {}; s.withheld = set()
    def put(s, i, typ, p, by):
        s.n += 1; rev = sha(enc({"id": i, "p": p, "n": s.n}))          # stands in for the salted revision hash
        s.history.setdefault(i, []).append(rev); s.objs[i] = dict(type=typ, p=p, rev=rev, by=by); return rev
    def change(s, origin=None, note=""):
        s.n += 1; c = ident("change %d" % s.n); s.changes[c] = dict(origin=origin, note=note, time=1767225600000 + s.n); return c
    # ---- digests (4.4) ----
    def refs_in(s, v, out):
        if isinstance(v, Tag):
            if v.n == 55461: out.add(v.v)
            elif v.n == 55462 and "d" not in v.v and "u" not in v.v: pass      # an unpinned anchor: see finding 4
            else: s.refs_in(v.v, out)
        elif isinstance(v, list): [s.refs_in(x, out) for x in v]
        elif isinstance(v, dict): [s.refs_in(x, out) for x in v.values()]
    def closure(s, v):
        seen = set(); todo = set(); s.refs_in(v, todo)
        while todo:
            i = todo.pop()
            if i in seen or i not in s.objs or s.objs[i]["type"] == "ufo.change": continue
            seen.add(i); s.refs_in(s.objs[i]["p"], todo)
        return sorted(seen)
    def content(s, a):
        o = s.objs[a["o"]]; reg = a.get("a")
        if not reg: return o["p"]
        (axis, r), = reg.items(); lo, hi = r[1], r[2]                         # miniature: positions stand in for element boundaries, so its edits keep lengths
        covered = o["p"][axis][lo:hi]
        if o["type"] == "ufo.text":                                             # finding 1: spans that touch the region are part of what it shows
            sp = {k: v for k, v in o["p"].get("spans", {}).items() if v["a"] < hi and v["b"] > lo}
            return [covered, sp]
        return covered
    def digest(s, a, salt):
        c = s.content(a); followed = s.closure(c)
        return sha(salt + enc(c) + b"".join(i + s.objs[i]["rev"] for i in followed)), len(followed)
    def pin(s, a):
        s.n += 1; salt = sha(b"salt%d" % s.n)[:16]; d, _ = s.digest(a, salt); return dict(a, d=d, s=salt, r=s.objs[a["o"]]["rev"])
    def state(s, p, depth=0):
        if p["o"] not in s.objs: return "detached"
        d, _ = s.digest({k: v for k, v in p.items() if k in ("o", "a")}, p["s"])
        if d != p["d"]: return "stale"
        f = s.objs[p["o"]]["p"].get("from")                                     # D1: a pin to a stale derivation is stale
        if f and depth < 16 and any(s.state(q, depth + 1) != "current" for q in f["sources"]): return "stale"
        return "current"
    # ---- the derive action (8.3, 11.8) ----
    def derive(s, sources, how, origin, make, replaces=None):
        """sources: anchors. origin: who and with what. make(inputs) -> {id: (type, properties)}: the model's output."""
        c = s.change(origin=origin, note="derive: " + how)
        pins = [s.pin(a) for a in sources]                                      # computed by the kernel, from what is actually there
        inputs = [s.content(a) for a in sources]
        for i, (typ, p) in make(inputs, origin).items():
            s.put(i, typ, dict(p, **{"from": {"sources": pins, "how": how, "by": ref(c)}}), c)
        return c
    def recipe(s, i):
        """Everything needed to make the object again, and whether it still can be made."""
        f = s.objs[i]["p"]["from"]; ch = s.changes[f["by"].v]; o = ch["origin"]; lines = []
        for p in f["sources"]:
            lines.append("source o:%s%s r:%s state=%s" % (p["o"].hex()[:8], " %s=[%d,%d]" % ((k := list(p["a"])[0]), p["a"][k][1], p["a"][k][2]) if p.get("a") else "", p["r"].hex()[:8], s.state(p)))
        prompt = "withheld" if o["prompt"].v in s.withheld else repr(s.objs[o["prompt"].v]["p"]["chars"])
        lines.append("how=%s by=model model=%r asked=%r parameters=%r prompt=%s change=o:%s" % (f["how"], o["model"], o["asked"]["name"], o["parameters"], prompt, f["by"].v.hex()[:8]))
        return lines
    def refresh(s, i, model):
        f = s.objs[i]["p"]["from"]; o = s.changes[f["by"].v]["origin"]
        if o["prompt"].v in s.withheld: return "refused: the prompt is withheld in this copy; the recipe names its hash but cannot be repeated here"
        srcs = [{k: v for k, v in p.items() if k in ("o", "a")} for p in f["sources"]]
        c = s.derive(srcs, f["how"], o, lambda inputs, origin: {i: model(inputs, origin, s)}, replaces=i)
        return "regenerated in change o:%s; revisions of the object now: %d" % (c.hex()[:8], len(s.history[i]))
def stand_in_model(inputs, origin, uni):
    """A deterministic stand-in for a language model: first sentence of the passage, largest figure of the data."""
    passage = inputs[0][0]; group = inputs[1]; data = uni.objs[group["children"][0].v]["p"]["rows"]
    top = max(data.items(), key=lambda kv: kv[1])
    words = (passage.split(". ")[0] + ".").split()[: origin["parameters"]["max_words"]]
    return ("ufo.text", {"chars": " ".join(words) + " Largest figure: %s, %s." % top})
if __name__ == "__main__":
    U = Universe(); c0 = U.change(origin={"basis": "witnessed", "by": "person"}); R, D, G, P, B, S2 = (ident(x) for x in ("report", "data", "chart", "prompt", "brief", "summary"))
    para = ["Costs were flat this quarter. Staffing did not change.", "Revenue grew in every region. The north led.", "The outlook is uncertain."]
    chars = "".join(para); a, b = len(para[0]), len(para[0]) + len(para[1])
    U.put(R, "ufo.text", {"chars": chars, "spans": {"em": {"a": a + 16, "b": a + 28, "role": "emphasis"}}}, c0)
    U.put(D, "ufo.data", {"rows": {"north": 41, "south": 17, "east": 23}}, c0)
    U.put(G, "ufo.group", {"children": [ref(D)], "label": "chart"}, c0)
    U.put(P, "ufo.text", {"chars": "Write a one-line brief of this passage and the chart."}, c0)
    say = lambda *x: print(*x)
    origin = {"basis": "witnessed", "by": "model", "model": "stand-in-1", "prompt": ref(P), "parameters": {"max_words": 12}, "asked": {"name": "A. Author"}}
    sources = [{"o": R, "a": {"chars": ["s", a, b]}}, {"o": G}]
    U.derive(sources, "transmute", origin, lambda i, o: {B: stand_in_model(i, o, U)})
    say("1. derived  :", repr(U.objs[B]["p"]["chars"])); [say("   ", l) for l in U.recipe(B)]
    U.derive([{"o": B}], "summarize", dict(origin, parameters={"max_words": 4}), lambda i, o: {S2: ("ufo.text", {"chars": " ".join(i[0]["chars"].split()[:4])})})
    st = lambda: "brief %s, summary of the brief %s" % (("stale" if any(U.state(p) != "current" for p in U.objs[B]["p"]["from"]["sources"]) else "current"), ("stale" if any(U.state(p) != "current" for p in U.objs[S2]["p"]["from"]["sources"]) else "current"))
    say("2. as made  :", st())
    p = dict(U.objs[R]["p"]); p["chars"] = chars.replace("Staffing did not change.", "Staffing fell by two.   "); U.put(R, "ufo.text", p, U.change())
    say("3. after an edit to the report outside the pinned passage (same length):", st())
    p = dict(U.objs[R]["p"]); p["spans"] = {"em": {"a": a + 16, "b": a + 28, "role": "strong"}}; U.put(R, "ufo.text", p, U.change())
    say("4. after restyling a span inside the pinned passage, characters untouched:", st(), " <- caught only because spans are in the digest")
    U.derive(sources, "transmute", origin, lambda i, o: {B: stand_in_model(i, o, U)}); U.derive([{"o": B}], "summarize", dict(origin, parameters={"max_words": 4}), lambda i, o: {S2: ("ufo.text", {"chars": " ".join(i[0]["chars"].split()[:4])})})
    U.put(D, "ufo.data", {"rows": {"north": 41, "south": 58, "east": 23}}, U.change())
    say("5. after a figure changes in the data the chart refers to:", st(), "(the pin is to the chart; the digest followed its ref)")
    [say("   ", l) for l in U.recipe(B)]
    say("6. refresh  :", U.refresh(B, stand_in_model)); say("   now      :", repr(U.objs[B]["p"]["chars"])); say("   state    :", st(), "(the summary pins the brief's earlier revision)")
    U.withheld.add(P); U.put(D, "ufo.data", {"rows": {"north": 77, "south": 58, "east": 23}}, U.change())
    say("7. in a copy that withholds the prompt, after another change:"); [say("   ", l) for l in U.recipe(B)]; say("   refresh  :", U.refresh(B, stand_in_model))
    _, n = U.digest({"o": G}, b"0" * 16); say("8. objects followed for the chart's digest:", n)
