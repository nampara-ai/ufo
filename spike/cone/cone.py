#!/usr/bin/env python3
"""Throwaway: light-cone projections over the spike corpus. The structural layer is computed from
the objects alone (types, labels, headings, sizes, who changed what and when). The model layer,
if CONE_LAYERS=both, adds stored one-line summaries. Every call's output size is logged."""
import json, os, re, sys
D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "corpus.json")))
U, ROOT, SUM = D["universes"], D["root"], D["summaries"]
BOTH = os.environ.get("CONE_LAYERS") == "both"; LOG = os.environ.get("CONE_LOG")
out = []
def emit(s): out.append(s)
def js(s): return json.dumps(s, ensure_ascii=False)
def obj(u, o): return U[u]["objects"][o]
def size(u, o, seen=()):
    """characters of content beneath an object: what reading all of it would cost"""
    x = obj(u, o)
    if x["type"] == "ufo.text": return sum(len(b[2]) for b in x["blocks"])
    if x["type"] == "ufo.data": return sum(len("\t".join(map(str, r))) for r in x["rows"].values())
    if x["type"] == "ufo.group": return sum(size(u, c) for c in x["children"])
    if x["type"] == "ufo.portal": return size(x["of"]["u"], x["of"]["o"])
    return 0
def a_str(u, o, reg=None): return "%s/o:%s%s" % (u, o, "" if reg is None else "[%d,%d]" % reg if isinstance(reg[0], int) else "rows=[%s,%s]" % reg)
def summary(u, o): return (' summary=%s state=current' % js(SUM["%s %s" % (u, o)])) if BOTH and "%s %s" % (u, o) in SUM else ""
def part_line(u, o):
    x = obj(u, o); extra = ""
    if x["type"] == "ufo.portal": t = x["of"]; extra = " presents=%s" % a_str(t["u"], t["o"]); return "part %s type=%s label=%s chars=%d%s changed=%s by=%s%s" % (a_str(u, o), x["type"], js(x["label"]), size(u, o), extra, x["when"], js(x["by"]), summary(t["u"], t["o"]))
    if x["type"] == "ufo.group": extra = " children=%d" % len(x["children"])
    if x["type"] == "ufo.data": extra = " rows=%d cols=%s" % (len(x["rows"]), js(x["cols"]))
    if x["type"] == "ufo.text": extra = " blocks=%d" % len(x["blocks"])
    return "part %s type=%s label=%s chars=%d%s changed=%s by=%s%s" % (a_str(u, o), x["type"], js(x["label"]), size(u, o), extra, x["when"], js(x["by"]), summary(u, o))
def spans(x):
    pos = 0; r = []
    for role, lvl, s in x["blocks"]: r.append((pos, pos + len(s), role, lvl, s)); pos += len(s)
    return r
def outline(u, o, a, b):
    x = obj(u, o); bl = [s for s in spans(x) if s[0] >= a and s[1] <= b]
    heads = [s for s in bl if s[2] == "heading" and not (s[0] == a and (a, b) != (0, size(u, o)) )]   # a region's own heading is not its sub-heading
    for lvl in sorted({h[3] for h in heads}):
        hs = [h for h in heads if h[3] == lvl]
        if len(hs) >= 2 or (lvl == max(h[3] for h in heads)):
            ends = [h[0] for h in hs[1:]] + [b]
            if hs[0][0] > a and any(s[2] != "heading" for s in bl if s[1] <= hs[0][0]): emit("part %s kind=preamble chars=%d" % (a_str(u, o, (a, hs[0][0])), hs[0][0] - a))
            for h, e in zip(hs, ends): emit("part %s kind=section level=%d label=%s chars=%d blocks=%d" % (a_str(u, o, (h[0], e)), lvl, js(h[4]), e - h[0], len([s for s in bl if h[0] <= s[0] < e])))
            return
    group = [bl[i:i + 64] for i in range(0, len(bl), 64)] if len(bl) > 64 else None
    if group:
        for g in group: emit("part %s kind=blocks count=%d chars=%d first=%s" % (a_str(u, o, (g[0][0], g[-1][1])), len(g), g[-1][1] - g[0][0], js(g[0][4][:60])))
    else:
        for s in bl: emit("part %s kind=%s chars=%d first=%s" % (a_str(u, o, (s[0], s[1])), s[2], s[1] - s[0], js(s[4][:60])))
def parse(arg):
    m = re.match(r"^(u:[0-9a-f]{8})/o:([0-9a-f]{8})(?:\[(\d+),(\d+)\]|rows=\[(\w+),(\w+)\])?$", arg)
    if not m or m.group(1) not in U or m.group(2) not in U[m.group(1)]["objects"]: print("no such anchor: write it exactly as a projection showed it"); sys.exit(1)
    return m.group(1), m.group(2), (int(m.group(3)), int(m.group(4))) if m.group(3) else None, (m.group(5), m.group(6)) if m.group(5) else None
cmd = sys.argv[1] if len(sys.argv) > 1 else ""; arg = sys.argv[2] if len(sys.argv) > 2 else ""; content = 0
if cmd == "overview":
    r = U[ROOT]["roots"][0]; tot = size(ROOT, r); nobj = sum(len(u["objects"]) for u in U.values())
    types = {}
    for u in U.values():
        for x in u["objects"].values(): types[x["type"]] = types.get(x["type"], 0) + 1
    whens = sorted(x["when"] for u in U.values() for x in u["objects"].values()); bys = sorted({x["by"] for u in U.values() for x in u["objects"].values()})
    emit("universe %s label=%s objects=%d nested=%d chars=%d types=%s" % (ROOT, js(U[ROOT]["label"]), nobj, len(U) - 1, tot, js(types)))
    emit("history first=%s last=%s actors=%s" % (whens[0], whens[-1], js(bys)))
    emit(part_line(ROOT, r).replace("part ", "root ", 1))
elif cmd == "expand":
    u, o, reg, rows = parse(arg); x = obj(u, o)
    if x["type"] == "ufo.portal": u, o = x["of"]["u"], x["of"]["o"]; x = obj(u, o); emit("follows %s label=%s" % (a_str(u, o), js(x["label"])))
    if x["type"] == "ufo.group":
        for c in x["children"]: emit(part_line(u, c))
    elif x["type"] == "ufo.text": outline(u, o, *(reg or (0, size(u, o))))
    elif x["type"] == "ufo.data":
        keys = sorted(x["rows"]); emit("table cols=%s rows=%d" % (js(x["cols"]), len(keys)))
        if rows: keys = [k for k in keys if rows[0] <= k <= rows[1]]
        if len(keys) > 10:
            for i in range(0, len(keys), 10): emit("part %s kind=rows count=%d" % (a_str(u, o, (keys[i], keys[min(i + 9, len(keys) - 1)])), len(keys[i:i + 10])))
        else:
            for k in keys: emit("row %s %s" % (k, "\t".join(map(str, x["rows"][k])))); content += len("\t".join(map(str, x["rows"][k])))
elif cmd == "text":
    u, o, reg, rows = parse(arg); x = obj(u, o)
    if x["type"] == "ufo.text":
        a, b = reg or (0, size(u, o)); s = "\n".join(t[4][max(a, t[0]) - t[0]: min(b, t[1]) - t[0]] for t in spans(x) if t[1] > a and t[0] < b); content = len(s); emit("text %s chars=%d s=%s" % (a_str(u, o, (a, b)), content, js(s)))
    elif x["type"] == "ufo.data":
        keys = [k for k in sorted(x["rows"]) if not rows or rows[0] <= k <= rows[1]]; s = "\n".join(k + "\t" + "\t".join(map(str, x["rows"][k])) for k in keys); content = len(s); emit("text %s cols=%s s=%s" % (a_str(u, o, rows), js(x["cols"]), js(s)))
    else: emit("text %s s=%s" % (a_str(u, o), js(x["label"])))
elif cmd == "why":
    u, o, reg, rows = parse(arg); x = obj(u, o); a, b = reg or (0, size(u, o)); hit = False
    for e in x.get("evidence", []):
        if e["a"] < b and e["b"] > a:
            hit = True; emit("run %s basis=%s by=%s model=%s asked=%s" % (a_str(u, o, (e["a"], e["b"])), e["origin"]["basis"], e["origin"]["by"], js(e["origin"]["model"]), js(e["origin"]["asked"])))
            for s in e["support"]: emit("evidence claim=%s kind=cites support=%s in=%s state=current" % (a_str(u, o, (e["a"], e["b"])), a_str(s["u"], s["o"], (s["a"], s["b"])), js(obj(s["u"], s["o"])["label"])))
    if not hit: emit("run %s basis=witnessed by=person who=%s changed=%s" % (a_str(u, o, (a, b)), js(x["by"]), x["when"]))
else:
    print("usage: cone.py overview | expand <anchor> | text <anchor> | why <anchor>"); sys.exit(1)
body = "\n".join(["%s %s @ commit=c:%s" % (cmd, arg, ROOT[2:])] + out + ["end lines=%d" % len(out)]); print(body)
if LOG: open(LOG, "a").write(json.dumps(dict(cmd=cmd, arg=arg, out=len(body), content=content, q=os.environ.get("CONE_Q", ""))) + "\n")
