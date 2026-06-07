#!/usr/bin/env python3
"""Upgrade the 7 workers + v2 PriceGuard to gpt-4.1 (proven to hold JSON contract).
Aria stays on claude-sonnet-4-6. Verify each with the hard empty-data envelope."""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"; CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"; INFER=f"{BASE}/v3/inference/chat/"
PROV,MODEL,CRED="OpenAI","gpt-4.1","lyzr_openai"
WORKERS=["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]
V2_PG="69a941c5ad0c99ac601ac935"
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
ENV_EMPTY=open("/tmp/_env_empty.txt").read()
ASK=["please provide","could you specify","please confirm","please clarify","let me know","insufficient","specify how"]
targets=[(w,created[w]["agent_id"]) for w in WORKERS]+[("price_guard_v2",V2_PG)]
for name,aid in targets:
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): print(f"{name:20} GET[{st}]"); continue
    before=ag.get("model")
    ag["provider_id"]=PROV; ag["model"]=MODEL; ag["llm_credential_id"]=CRED; ag["api_key"]=k
    pst,_=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    ist,resp=call("POST",INFER,H,{"user_id":"v","agent_id":aid,"session_id":f"u41-{name}","message":ENV_EMPTY},t=90)
    txt=(resp.get("response","") if isinstance(resp,dict) else str(resp)).strip()
    is_json=txt.startswith("{") and txt.endswith("}"); asked=any(s in txt.lower() for s in ASK)
    print(f"{name:20} {before} -> {MODEL}  PUT[{pst}] INFER[{ist}] {'✅JSON' if (is_json and not asked) else ('⚠️ASK' if asked else '❌'+str(ist))}")
