"""Throwaway: builds the spike's small universe, with a nested universe in the same pack."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from writer import *
OUT = os.path.join(os.path.dirname(__file__), "..", "out")
def ident(s): return sha(b"spike-id" + s.encode())[:16]
who = {"name": "Spike Author"}; actor = {"who": who, "with": {"name": "ufo-spike", "version": "0"}}

def text_object(change, first, blocks):
    """blocks: list of (role, props, [pieces]); a piece is 'str' or (inline role, props, 'str'). Returns chars, spans, count."""
    chars = ""; spans = {}; n = 0
    def el(i, side): return [change, first + i, side]
    starts = []
    for role, props, pieces in blocks:
        starts.append((len(chars), role, props))
        for piece in pieces:
            if isinstance(piece, str): chars += piece; continue
            irole, iprops, s = piece; a = len(chars); chars += s; n += 1
            spans["i%02d" % n] = dict(iprops, at=("T", a, len(chars) - 1), kind="inline", role=irole)
    for k, (a, role, props) in enumerate(starts):
        end = ("B", starts[k + 1][0]) if k + 1 < len(starts) else "end"
        spans["b%02d" % k] = dict(props, at=("BL", a, end), kind="block", role=role)
    return chars, spans
def finish_spans(T, change, first, spans):
    out = {}
    for k, s in spans.items():
        at = s["at"]
        if at[0] == "T": reg = ["s", [change, first + at[1], 0], [change, first + at[2], 1]]
        else: reg = ["s", [change, first + at[1], 0], "end" if at[2] == "end" else [change, first + at[2][1], 0]]
        out[k] = dict(s, at=anchor({"o": T, "a": {"chars": reg}}))
    return out

pk = Pack()
# ---- the nested universe: a note, with its own lineage, history and commit ----
NU, NT, NC = bytes(16), ident("note-text"), ident("note-change")
chars, spans = text_object(NC, 0, [("heading", {"level": 2}, ["A nested note"]),
    ("paragraph", {}, ["This text lives in its own universe, with its own history, inside the parent's pack. The parent presents it through a Portal and cannot change it."])])
spans = finish_spans(NT, NC, 0, spans)
hNU = revision(pk, NU, "ufo.universe", 1, NC, 1, {"lineage": bytes([0x22]) * 16, "roots": {"primary": ref(NT)}, "features": {"ufo.text": {"v": 1, "required": True}}})
hNT = revision(pk, NT, "ufo.text", 1, NC, 2, {"chars": chars, "spans": spans}, seq={"chars": [[NC, 0, len(chars)]]})
ops = [{"op": "new", "obj": NU, "type": "ufo.universe"}, {"op": "new", "obj": NT, "type": "ufo.text"}, {"op": "splice", "obj": NT, "key": "chars", "after": None, "ins": chars}]
_, _, _, NESTED = commit(pk, {NU: hNU, NT: hNT}, NC, ops, "The note.", {"actor": actor, "time": 1767225600000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 3)
# ---- the parent universe ----
U, G, T, R, P, FD, FP, C1 = bytes(16), ident("group"), ident("text"), ident("rule"), ident("portal"), ident("face-doc"), ident("face-pages"), ident("change-1")
LONG = ("The outlook depends on three things. First, whether demand in the north holds through the winter. Second, whether the two new markets reach the volume the plan assumes. Third, whether costs stay flat once the new warehouse opens. "
        "None of these is certain, and the figures in this review should be read with that in mind. ")
chars, spans = text_object(C1, 0, [
    ("heading", {"level": 1}, ["Quarterly Review"]),
    ("paragraph", {}, ["Revenue grew in ", ("emphasis", {}, "every region"), " this quarter, led by the ", ("strong", {}, "north"), ". This paragraph is long enough to wrap across several lines at any reasonable width, which is what the layout algorithm has to get right."]),
    ("heading", {"level": 2}, ["Highlights"]),
    ("item", {"level": 1, "marker": "bullet"}, ["Revenue up twelve percent"]),
    ("item", {"level": 1, "marker": "bullet"}, ["Costs flat for the third quarter running, despite the new warehouse"]),
    ("item", {"level": 1, "marker": "bullet"}, ["Two new markets opened"]),
    ("heading", {"level": 2}, ["Outlook"]),
    ("paragraph", {}, [LONG]), ("paragraph", {}, [LONG.replace("three", "the same three")]), ("paragraph", {}, [LONG.replace("First", "To begin")]),
    ("heading", {"level": 2}, ["Appendix"]),
    ("paragraph", {}, [("embed", {"child": ref(P)}, "￼")]),
    ("paragraph", {}, ["The note above is presented from another universe."])])
spans = finish_spans(T, C1, 0, spans)
props = {
    U: ("ufo.universe", {"lineage": bytes([0x11]) * 16, "roots": {"primary": ref(FD)}, "faces": [ref(FD), ref(FP)], "features": {"ufo.text": {"v": 1, "required": True}, "ufo.portal": {"v": 1, "required": False}}}),
    G: ("ufo.group", {"layout": "flow", "gap": 12.0, "children": [ref(T), ref(R)]}),
    T: ("ufo.text", {"chars": chars, "spans": spans, "size": 16.0}),
    R: ("ufo.path", {"d": [["M", 0.0, 0.5], ["L", 240.0, 0.5]], "stroke": [0.2, 0.2, 0.2, 1.0], "width": 1.0, "w": 240.0, "h": 1.0}),
    P: ("ufo.portal", {"of": anchor({"o": NT, "u": NESTED}), "place": "block", "label": "A nested note"}),
    FD: ("ufo.face", {"of": ref(G), "medium": "document", "label": "Document"}),
    FP: ("ufo.face", {"of": ref(G), "medium": "pages", "label": "Pages", "sampling": {"page": [420.0, 595.0], "margins": [40.0, 40.0, 40.0, 40.0]}}),
}
state = {}; ops = []; s = 10
for i, (typ, p) in props.items():
    ops.append({"op": "new", "obj": i, "type": typ})
    for k, v in p.items():
        if i == T and k == "chars": ops.append({"op": "splice", "obj": i, "key": "chars", "after": None, "ins": v})
        else: ops.append({"op": "set", "obj": i, "key": k, "val": v})
    s += 1; state[i] = revision(pk, i, typ, 1, C1, s, p, seq={"chars": [[C1, 0, len(chars)]]} if i == T else None)
_, _, _, ROOT = commit(pk, state, C1, ops, "The review.", {"actor": actor, "time": 1767312000000, "origin": {"basis": "witnessed", "by": "person", "who": who}}, None, 0, 30)
pk.index(); pk.head(ROOT)
os.makedirs(OUT, exist_ok=True); open(os.path.join(OUT, "doc.ufx"), "wb").write(pk.b)
print("doc.ufx", len(pk.b), "bytes; root", ROOT.hex()[:16], "nested", NESTED.hex()[:16], "chars", len(chars), "spans", len(spans))
