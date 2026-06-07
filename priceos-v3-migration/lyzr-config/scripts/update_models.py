#!/usr/bin/env python3
"""
Set models on the v3 agents using PROVEN provider/model/credential triples
copied from existing working agents (no guessing, no probing):
  - Aria (manager) -> Claude Sonnet 4.6   (from Dashboard agent 69df6b63...)
  - 7 workers       -> Gemini 3.0 Flash    (from v2 CRO agent 69998743...)
GET-merge-PUT each agent (preserves the fixed response_format, tools, prompt).
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
REF_CLAUDE="69df6b63fac6b1f936ca8e7b"   # Dashboard agent (Anthropic claude-sonnet-4-6)
REF_GEMINI="69998743f4d61186679a9515"   # v2 CRO router (Google gemini-3-flash-preview)

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

def triple(aid):
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): sys.exit(f"ref GET {aid} failed [{st}]")
    return ag.get("provider_id"), ag.get("model"), ag.get("llm_credential_id")

claude=triple(REF_CLAUDE); gemini=triple(REF_GEMINI)
print(f"REF claude (Aria)   -> provider={claude[0]} model={claude[1]} cred={claude[2]}")
print(f"REF gemini (workers)-> provider={gemini[0]} model={gemini[1]} cred={gemini[2]}")

created=json.loads(CREATED.read_text())
plan={"aria":claude}
for w in ["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]:
    plan[w]=gemini

for name,(prov,model,cred) in plan.items():
    aid=created.get(name,{}).get("agent_id")
    if not aid: print(f"{name}: no id, skip"); continue
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): print(f"{name}: GET [{st}]"); continue
    ag["provider_id"]=prov; ag["model"]=model
    if cred: ag["llm_credential_id"]=cred
    ag["api_key"]=k
    st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name}: -> {model} PUT [{st2}] {json.dumps(resp)[:70]}")
