#!/usr/bin/env python3
"""
Switch the 7 worker agents (currently Gemini) + the v2 PriceGuard agent
(currently the RETIRED gemini-2.0-flash-lite) to OpenAI gpt-4o-mini.
Aria stays on anthropic/claude-sonnet-4-6 (it's the orchestrator, not Gemini).
GET-merge-PUT; verifies with a real 1-token inference after each switch.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
INFER=f"{BASE}/v3/inference/chat/"
PROVIDER="OpenAI"; MODEL="gpt-4o-mini"; CRED="lyzr_openai"
WORKERS=["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]
V2_PRICE_GUARD="69a941c5ad0c99ac601ac935"  # the agent precompute actually calls for price_guard
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

targets=[(w, created[w]["agent_id"]) for w in WORKERS]
targets.append(("price_guard_v2", V2_PRICE_GUARD))

for name,aid in targets:
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict):
        print(f"{name:20} GET [{st}] {str(ag)[:80]}"); continue
    before=ag.get("model")
    ag["provider_id"]=PROVIDER; ag["model"]=MODEL; ag["llm_credential_id"]=CRED
    ag["api_key"]=k
    pst,pre=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    # verify by real inference
    ist,ire=call("POST",INFER,H,{"user_id":"verify","agent_id":aid,"session_id":f"verify-{name}","message":"reply OK"},t=60)
    ok = ist==200 and "notfounderror" not in json.dumps(ire).lower() and "no longer available" not in json.dumps(ire).lower()
    print(f"{name:20} {before} -> {MODEL}  PUT[{pst}] INFER[{ist}] {'✅' if ok else '❌ '+json.dumps(ire)[:100]}")
