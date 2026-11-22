"""Throwaway: a small body of research as an object model (not a pack): one corpus universe
with a report, and three nested study universes with documents, interviews and a dataset."""
import hashlib, json, random
def hid(*s): return hashlib.sha256("/".join(s).encode()).hexdigest()[:8]
FILL = """The committee reviewed the schedule and agreed that no change was needed this quarter.
Staff reported that the procedure had been followed on each of the days inspected.
Records for the period were complete, apart from two entries that were later corrected.
The contractor confirmed the dates in writing and attached the usual certificates.
Several residents wrote in, mostly to ask when the work would be finished.
The budget line was unchanged from the previous year, after allowing for inflation.
A follow-up visit was arranged, and its findings are recorded in the next section.
The figures were checked against the ledger by a second member of staff.
No complaint was received during the period covered by this document.
The equipment was inspected visually and found to be in ordinary working condition.
Minutes of the meeting were circulated within a week, as the standing orders require.
The supplier asked for a further fortnight, which the manager granted.
Weather during the visit was dry, and access to the site was straightforward.
The training records show that all staff on the rota had completed the course.
An earlier draft of this section was withdrawn after comments from the auditor.
The inventory was counted twice, and the two counts agreed.
The request was passed to the district office, which acknowledged it the same day.
Photographs were taken at each stage and are held with the site file.
The handover notes were brief but covered every item on the checklist.
The policy has not changed since it was adopted, though a review is now due.""".split("\n")
def para(rng, n=None, plant=None):
    s = rng.sample(FILL, n or rng.randint(4, 6))
    if plant: s.insert(rng.randint(1, len(s) - 1), plant)
    return " ".join(s)
STUDIES = {
 "water": dict(title="Harbour Street water treatment works", people=["plant manager", "night-shift operator", "laboratory technician", "maintenance contractor", "district engineer", "resident of Quay Row", "former supervisor", "safety officer"],
   docs={"Site description": ["Location and catchment", "Buildings and plant", "Staffing", "Access"], "Sampling method": ["Sampling sites", "Frequency", "Laboratory procedure", "Quality control"],
         "Maintenance records 2025": ["Pumps", "Valves", "Filters", "Electrical", "Outstanding work"], "Incident review": ["Timeline", "Immediate response", "Causes considered", "Bypass valve", "Lessons"],
         "Regulatory correspondence": ["Notices received", "Replies sent", "Open questions"], "Cost estimates": ["Replacement options", "Running costs", "Funding"], "Staff survey": ["Response rate", "Workload", "Training"], "Limitations": ["Gaps in the record", "Sources of error"]},
   cols=["site", "date", "nitrate_mg_l", "turbidity_ntu", "ph"]),
 "meals": dict(title="Northside school meals programme", people=["head cook", "school bursar", "year-six teacher", "parent governor", "delivery driver", "dietitian", "caretaker", "pupil council representative"],
   docs={"Programme description": ["Schools covered", "Menu cycle", "Suppliers", "Eligibility"], "Uptake figures": ["By school", "By year group", "Free meals", "Trends"],
         "Kitchen inspections": ["Hygiene", "Equipment", "Storage", "Allergen handling"], "Waste audit": ["Method", "Plate waste", "Kitchen waste", "Causes considered"],
         "Parent consultation": ["Meetings held", "Themes", "Requests"], "Cost per meal": ["Ingredients", "Labour", "Energy", "Comparison"], "Nutrition review": ["Standards", "Findings", "Recommendations"], "Limitations": ["Gaps in the record", "Sources of error"]},
   cols=["school", "week", "meals_served", "waste_kg", "cost_per_meal"]),
 "lights": dict(title="Canal towpath lighting", people=["lighting engineer", "boat owner", "cycling club secretary", "police liaison officer", "ecologist", "ward councillor", "night-shift nurse", "angling society chair"],
   docs={"Route description": ["Sections", "Bridges", "Access points", "Ownership"], "Lighting survey": ["Method", "Lamp columns", "Dark sections", "Faults found"],
         "Use counts": ["Counters", "By hour", "By season"], "Incident reports": ["Reported incidents", "Locations", "Times of day", "Causes considered"],
         "Ecology assessment": ["Bats", "Water birds", "Mitigation"], "Options appraisal": ["Do nothing", "Solar studs", "Columns with dimming", "Costs"], "Consultation": ["Responses", "Objections", "Support"], "Limitations": ["Gaps in the record", "Sources of error"]},
   cols=["section", "month", "users_per_night", "lux_min", "faults"]),
}
PLANTS = {  # (study, doc, section) -> planted sentence
 ("water", "Incident review", "Bypass valve"): "The bypass valve was found seized half open on 14 March, and the review concluded that it had not been exercised since its installation in 2011.",
 ("water", "Maintenance records 2025", "Valves"): "The schedule calls for every valve to be exercised twice a year; the bypass valve has no entry in any year on file.",
 ("meals", "Waste audit", "Plate waste"): "Plate waste fell from 31 percent to 12 percent of food served in the three schools that moved the lunch break to after play.",
 ("lights", "Lighting survey", "Dark sections"): "The 340 metres between Mill Bridge and the lock have no lamp column at all, and 9 of the 14 reported incidents happened there.",
 ("lights", "Ecology assessment", "Bats"): "Daubenton's bats feed along the lock pool, and the ecologist asked that any lighting there be amber and dimmed after eleven.",
}
INTERVIEW_PLANT = {("water", 6): ("It was the second week of March when pump two tripped, and it was not the pump at all: the float switch in the wet well had stuck, so the pump ran dry and cut out on temperature.", "night-shift operator"),
                   ("meals", 3): ("Since we moved lunch to after play the children sit for longer, and I scrape far less into the bin.", "head cook"),
                   ("lights", 2): ("I moor by the lock, and I have twice had to help someone out of the water there after dark.", "boat owner")}
def build(seed=7):
    rng = random.Random(seed); U = {}; summaries = {}
    def text(uni, title, blocks, by, when):
        i = hid(uni, title); U[uni]["objects"][i] = dict(type="ufo.text", label=title, blocks=blocks, by=by, when=when); return i
    corpus = "u:" + hid("corpus"); U[corpus] = dict(label="Infrastructure review 2026", objects={}, roots=[])
    study_ids = {}
    for key, S in STUDIES.items():
        uni = "u:" + hid("study", key); U[uni] = dict(label=S["title"], objects={}, roots=[]); study_ids[key] = uni; kids = []
        for d, (doc, secs) in enumerate(S["docs"].items()):
            blocks = [("heading", 1, doc)]
            for sec in secs:
                blocks.append(("heading", 2, sec))
                for k in range(rng.randint(2, 3)):
                    blocks.append(("paragraph", 0, para(rng, plant=PLANTS.get((key, doc, sec)) if k == 1 else None)))
            i = text(uni, doc, blocks, rng.choice(["A. Lindqvist", "T. Reyes", "M. Okafor"]), "2026-0%d-%02d" % (rng.randint(1, 6), rng.randint(1, 28))); kids.append(i)
            summaries[(uni, i)] = "%s for the %s: %s." % (doc, S["title"], ", ".join(s.lower() for s in secs))
        iv = []
        for n in range(1, 9):
            role = S["people"][n - 1]; blocks = []
            for k in range(12):
                plant = INTERVIEW_PLANT[(key, n)][0] if (key, n) in INTERVIEW_PLANT and k == 7 else None
                blocks.append(("paragraph", 0, para(rng, plant=plant)))
            i = text(uni, "Interview %d" % n, blocks, "T. Reyes", "2026-04-%02d" % (n + 3)); iv.append(i)
            gist = {("water", 6): "recalls pump two tripping in March and what caused it", ("meals", 3): "describes the effect of moving lunch to after play", ("lights", 2): "describes rescues near the lock after dark"}.get((key, n), "routine account of duties; nothing unusual reported")
            summaries[(uni, i)] = "Interview with the %s: %s." % (role, gist)
        gi = hid(uni, "interviews"); U[uni]["objects"][gi] = dict(type="ufo.group", label="Interviews", children=iv, by="T. Reyes", when="2026-04-12")
        summaries[(uni, gi)] = "Eight interviews with staff and users of the %s." % S["title"]
        rows = {}
        for r in range(40):
            rows["r%02d" % r] = [rng.choice(["upstream", "intake", "outfall", "downstream", "quay"]) if key == "water" else "unit-%d" % rng.randint(1, 6), "2026-%02d" % rng.randint(1, 6)] + [round(rng.uniform(1, 30), 1), round(rng.uniform(0.5, 9), 1), round(rng.uniform(6.5, 8.5), 1)]
        if key == "water": rows["r27"] = ["downstream", "2026-03", 47.3, 6.1, 7.2]
        di = hid(uni, "dataset"); U[uni]["objects"][di] = dict(type="ufo.data", label="Measurements", cols=S["cols"], rows=rows, by="A. Lindqvist", when="2026-05-02")
        summaries[(uni, di)] = "Forty measurements: %s." % ", ".join(S["cols"])
        root = hid(uni, "root"); U[uni]["objects"][root] = dict(type="ufo.group", label=S["title"], children=kids + [gi, di], by="M. Okafor", when="2026-05-20"); U[uni]["roots"] = [root]
        summaries[(uni, root)] = {"water": "Study of the Harbour Street works after the March 2025 incident: site, sampling, maintenance, incident review, costs, interviews, measurements.",
                                  "meals": "Study of the Northside school meals programme: uptake, inspections, waste, cost, nutrition, interviews, measurements.",
                                  "lights": "Study of lighting on the canal towpath: survey, use, incidents, ecology, options, consultation, interviews, measurements."}[key]
    # the report, with evidence into the studies
    def find(key, doc, sec):
        uni = study_ids[key]; i = hid(uni, doc); pos = 0
        for role, lvl, s in U[uni]["objects"][i]["blocks"]:
            if PLANTS[(key, doc, sec)] in s: return dict(u=uni, o=i, a=pos, b=pos + len(s))
            pos += len(s)
    C = [("The bypass valve at Harbour Street should be replaced, and every valve put on the exercise schedule.", [("water", "Incident review", "Bypass valve"), ("water", "Maintenance records 2025", "Valves")]),
         ("Schools should move the lunch break to after play.", [("meals", "Waste audit", "Plate waste")]),
         ("The towpath between Mill Bridge and the lock should be lit first, with amber lamps dimmed after eleven at the lock pool.", [("lights", "Lighting survey", "Dark sections"), ("lights", "Ecology assessment", "Bats")])]
    blocks = [("heading", 1, "Infrastructure review 2026"), ("heading", 2, "Purpose"), ("paragraph", 0, para(rng)), ("heading", 2, "Water"), ("paragraph", 0, para(rng)), ("paragraph", 0, para(rng)),
              ("heading", 2, "School meals"), ("paragraph", 0, para(rng)), ("heading", 2, "Towpath lighting"), ("paragraph", 0, para(rng)), ("heading", 2, "Conclusions")]
    evidence = []
    for s, ev in C:
        pos = sum(len(b[2]) for b in blocks); blocks.append(("paragraph", 0, s)); evidence.append(dict(a=pos, b=pos + len(s), support=[find(*e) for e in ev], origin=dict(basis="witnessed", by="model", model="example-model-1", asked="M. Okafor")))
    rep = hid(corpus, "report"); U[corpus]["objects"][rep] = dict(type="ufo.text", label="Infrastructure review 2026", blocks=blocks, by="M. Okafor", when="2026-06-10", evidence=evidence)
    summaries[(corpus, rep)] = "The review's report: purpose, one section per study, and three conclusions with their evidence."
    kids = [rep]
    for key, uni in study_ids.items():
        p = hid(corpus, "portal", key); U[corpus]["objects"][p] = dict(type="ufo.portal", label=STUDIES[key]["title"], of=dict(u=uni, o=U[uni]["roots"][0]), by="M. Okafor", when="2026-06-01"); kids.append(p)
    root = hid(corpus, "root"); U[corpus]["objects"][root] = dict(type="ufo.group", label="Infrastructure review 2026", children=kids, by="M. Okafor", when="2026-06-10"); U[corpus]["roots"] = [root]
    summaries[(corpus, root)] = "A review of three pieces of local infrastructure, with a report and one study each of a water works, a school meals programme and towpath lighting."
    return corpus, U, {"%s %s" % k: v for k, v in summaries.items()}
if __name__ == "__main__":
    corpus, U, S = build(); json.dump(dict(root=corpus, universes=U, summaries=S), open("corpus.json", "w"))
    chars = sum(sum(len(b[2]) for b in o.get("blocks", [])) + sum(len(json.dumps(r)) for r in o.get("rows", {}).values()) for u in U.values() for o in u["objects"].values())
    print("universes", len(U), "objects", sum(len(u["objects"]) for u in U.values()), "characters of content", chars, "model summaries", len(S), "summary chars", sum(len(v) for v in S.values()))
