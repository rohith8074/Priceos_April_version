#!/usr/bin/env python3
"""
1. Push hardened worker prompts (/tmp/np_<key>.txt) to the 7 v3 workers.
2. Rename ALL 8 agents to 'May_update_{DisplayName}'.
3. Preserve each agent's existing tools (GET-merge-PUT — do NOT rebuild tool attachments).
4. Verify each with a real 1-token inference (a question-asking failure or 'no longer
   available' counts as FAIL).
Aria keeps its manager instructions; only its name changes.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
INFER=f"{BASE}/v3/inference/chat/"

# key -> (display name, prompt file or None to keep existing)
AGENTS={
 "aria":                 ("Aria_CRO_Router",       None),
 "property_analyst":     ("Property_Analyst",      "/tmp/np_property_analyst.txt"),
 "booking_intelligence": ("Booking_Intelligence",  "/tmp/np_booking_intelligence.txt"),
 "market_research":      ("Market_Research",       "/tmp/np_market_research.txt"),
 "priceguard":           ("PriceGuard",            "/tmp/np_priceguard.txt"),
 "anomaly_detector":     ("Anomaly_Detector",      "/tmp/np_anomaly_detector.txt"),
 "atlas":                ("Atlas",                 "/tmp/np_atlas.txt"),
 "event_intelligence":   ("Event_Intelligence",    "/tmp/np_event_intelligence.txt"),
}
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(m,u,H,b=None,t=90):
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(u,data=d,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t); raw=x.read().decode()
        try: return x.status,json.loads(raw)
        except: return x.status,raw
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try: return e.code,json.loads(raw)
        except: return e.code,raw
    except Exception as e: return 0,str(e)
k=key(); H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())

ASK_SIGNS=["please provide","could you specify","please confirm","please clarify",
           "let me know","please specify","provide the","i need ","specify how"]

for ky,(disp,pf) in AGENTS.items():
    aid=created[ky]["agent_id"]
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict):
        print(f"{ky:20} GET [{st}] FAIL"); continue
    new_name=f"May_update_{disp}"
    ag["name"]=new_name
    tools_before=len(ag.get("tools") or [])
    if pf:
        ag["agent_instructions"]=Path(pf).read_text()
    ag["api_key"]=k
    pst,_=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    # verify name+tools persisted
    st2,ag2=call("GET",f"{BASE}/v3/agents/{aid}",H)
    tools_after=len(ag2.get("tools") or []) if isinstance(ag2,dict) else -1
    name_ok = isinstance(ag2,dict) and ag2.get("name")==new_name
    # real inference (skip aria — manager needs sub-agents; just confirm it runs)
    msg = "reply with valid JSON only" if pf else "hi"
    ist,ire=call("POST",INFER,H,{"user_id":"verify","agent_id":aid,"session_id":f"vmay-{ky}","message":msg},t=70)
    resp_txt=json.dumps(ire).lower()
    infer_ok = ist==200 and "no longer available" not in resp_txt and "notfounderror" not in resp_txt
    asked = any(s in resp_txt for s in ASK_SIGNS)
    flag = "✅" if (infer_ok and not asked) else ("⚠️ASKS" if asked else f"❌{ist}")
    print(f"{ky:20} name={new_name:32} tools {tools_before}->{tools_after} PUT[{pst}] INFER[{ist}] {flag}")
