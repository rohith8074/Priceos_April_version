#!/usr/bin/env python3
"""
Stop agents from emitting artifacts / file output (which returns conversational
text + an artifact instead of the inline JSON the precompute orchestrator parses).
Sets disable_artifacts=true and file_output=false on all v3 agents. GET-merge-PUT.
"""
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
def call(m,u,H,b=None,t=60):
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
for name,v in created.items():
    aid=v.get("agent_id")
    if not aid: continue
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): print(f"{name}: GET [{st}]"); continue
    before=(ag.get("disable_artifacts"), ag.get("file_output"))
    ag["disable_artifacts"]=True
    ag["file_output"]=False
    ag["api_key"]=k
    st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name:20} disable_artifacts:{before[0]}->True file_output:{before[1]}->False  PUT [{st2}]")
