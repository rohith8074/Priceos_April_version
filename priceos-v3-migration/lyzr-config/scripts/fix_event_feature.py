#!/usr/bin/env python3
"""
The WEB_SEARCH feature I added breaks inference ('Invalid feature type: WEB_SEARCH').
Discover the correct feature schema from an agent that already has web search (the
dashboard agent, known to search), else strip the bad feature so the agent runs.
Verify with real inference.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
INFER=f"{BASE}/v3/inference/chat/"
def kv(p):
    for l in ENV.read_text().splitlines():
        if l.startswith(p): return l.split("=",1)[1].strip().strip('"')
    return None
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
k=kv("LYZR_API_KEY="); H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())

# Look for any agent in this account that already carries a features[] with web search,
# to learn the correct 'type' string. Scan known agent ids from .env + dashboard.
scan_ids=set()
for l in ENV.read_text().splitlines():
    if "AGENT_ID=" in l or "Agent_ID=" in l:
        v=l.split("=",1)[1].strip().strip('"')
        if v and len(v)>=12: scan_ids.add(v)
for v in created.values(): scan_ids.add(v["agent_id"])
scan_ids.add("69df6b63fac6b1f936ca8e7b")  # dashboard

correct_feature=None
for aid in scan_ids:
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st==200 and isinstance(ag,dict):
        feats=ag.get("features") or []
        for f in feats:
            ftype=(f.get("type") if isinstance(f,dict) else "")
            if ftype and "search" in ftype.lower() and ftype!="WEB_SEARCH":
                correct_feature=f; print(f"  found web-search feature on {aid}: {json.dumps(f)[:160]}")
print("Correct feature discovered:", json.dumps(correct_feature) if correct_feature else "NONE")

# Apply to event_intelligence: use discovered feature, else strip features entirely.
eid=created["event_intelligence"]["agent_id"]
st,ag=call("GET",f"{BASE}/v3/agents/{eid}",H)
ag["features"]=[correct_feature] if correct_feature else []
ag["api_key"]=k
pst,_=call("PUT",f"{BASE}/v3/agents/{eid}",H,ag)
ist,ire=call("POST",INFER,H,{"user_id":"v","agent_id":eid,"session_id":"v-evt","message":"reply OK"},t=60)
ok=ist==200 and "invalid feature" not in json.dumps(ire).lower()
print(f"event_intelligence features={json.dumps(ag['features'])[:120]} PUT[{pst}] INFER[{ist}] {'✅' if ok else '❌ '+json.dumps(ire)[:120]}")
