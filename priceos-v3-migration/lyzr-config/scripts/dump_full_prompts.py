#!/usr/bin/env python3
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(u,H,t=60):
    try:
        x=urllib.request.urlopen(urllib.request.Request(u,method="GET",headers=H),timeout=t); return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return e.code,e.read().decode("utf-8","replace")
    except Exception as e: return 0,str(e)
k=key(); H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())
for name,v in created.items():
    aid=v.get("agent_id")
    st,ag=call(f"{BASE}/v3/agents/{aid}",H)
    instr=ag.get("agent_instructions","") if isinstance(ag,dict) else str(ag)
    Path(f"/tmp/prompt_{name}.txt").write_text(instr)
    print(f"WROTE /tmp/prompt_{name}.txt  ({len(instr)}c)")
