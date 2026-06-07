#!/usr/bin/env python3
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def get(u,H,t=40):
    try:
        x=urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=t); return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return e.code,e.read().decode("utf-8","replace")
    except Exception as e: return 0,str(e)
k=key(); H={"Content-Type":"application/json","x-api-key":k}
# concierge id (hardcoded fallback)
CONCIERGE="6a09d9428e3a6bafa13d8284"
st,ag=get(f"{BASE}/v3/agents/{CONCIERGE}",H)
if st==200 and isinstance(ag,dict):
    tools=ag.get("tools") or []
    tnames=[t if isinstance(t,str) else (t.get("name") or t.get("id")) for t in tools]
    print(f"CONCIERGE {CONCIERGE}: model={ag.get('model')} tools={tnames} instr={len(ag.get('agent_instructions') or '')}c")
else:
    print(f"CONCIERGE {CONCIERGE}: GET [{st}] {str(ag)[:120]}")
# event_intelligence features (web search?)
EVENT="6a1bd3ea564d7dbff2c157be"
st,ag=get(f"{BASE}/v3/agents/{EVENT}",H)
if st==200 and isinstance(ag,dict):
    feats=ag.get("features")
    print(f"EVENT_INTEL features={json.dumps(feats)[:300]}")
    print(f"EVENT_INTEL model={ag.get('model')}")
