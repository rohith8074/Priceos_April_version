#!/usr/bin/env python3
"""
1. Read the concierge agent (known OpenAI) to learn the exact OpenAI provider_id /
   llm_credential_id this account uses.
2. Probe candidate models by actually RUNNING a 1-token inference (PUT 200 is NOT
   enough — gemini-2.0-flash-lite saves fine but 404s at runtime). We test on a
   throwaway clone of an existing worker so we don't disturb the real agents.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
INFER="https://agent-prod.studio.lyzr.ai/v3/inference/chat/"
def kv(pfx):
    for l in ENV.read_text().splitlines():
        if l.startswith(pfx): return l.split("=",1)[1].strip().strip('"')
    return None
def key(): return kv("LYZR_API_KEY=")
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

# 1. concierge OpenAI config
CONC="6a09d9428e3a6bafa13d8284"
st,ag=call("GET",f"{BASE}/v3/agents/{CONC}",H)
if st==200 and isinstance(ag,dict):
    print("CONCIERGE provider config:")
    print(f"  provider_id={ag.get('provider_id')!r} model={ag.get('model')!r} llm_credential_id={ag.get('llm_credential_id')!r}")
OAI_PROVIDER=ag.get("provider_id") if isinstance(ag,dict) else "OpenAI"
OAI_CRED=ag.get("llm_credential_id") if isinstance(ag,dict) else "lyzr_openai"

# 2. candidate models to verify by real inference
candidates=[
    ("OpenAI", "gpt-4o-mini", OAI_CRED),
    ("OpenAI", "openai/gpt-4o-mini", OAI_CRED),
    ("xai", "xai/grok-4.1-fast-reasoning", "lyzr_xai"),
    ("xai", "grok-4.1-fast-reasoning", "lyzr_xai"),
    ("Groq", "groq/grok-4.1-fast-reasoning", "lyzr_groq"),
]
# clone property_analyst as a throwaway probe agent
prop_id=json.loads(CREATED.read_text())["property_analyst"]["agent_id"]
st,base=call("GET",f"{BASE}/v3/agents/{prop_id}",H)
print(f"\nProbing models via real inference (base clone of property_analyst):")
results={}
for prov,model,cred in candidates:
    body=dict(base) if isinstance(base,dict) else {}
    body.pop("_id",None); body.pop("id",None)
    body["name"]=f"zzz_probe_{model.replace('/','_')}"
    body["provider_id"]=prov; body["model"]=model; body["llm_credential_id"]=cred
    body["agent_instructions"]="Reply with the single word OK."
    body["tools"]=[]; body["managed_agents"]=[]; body.pop("response_format",None)
    body["api_key"]=k
    cst,cre=call("POST",f"{BASE}/v3/agents/",H,body)
    aid=cre.get("agent_id") if isinstance(cre,dict) else None
    if not aid:
        print(f"  {model:34} CREATE [{cst}] {str(cre)[:90]}"); results[model]=("create_fail",cst); continue
    ist,ire=call("POST",INFER,H,{"user_id":"probe","agent_id":aid,"session_id":"probe-sess","message":"say OK"},t=60)
    ok = ist==200 and "error" not in json.dumps(ire).lower()
    snippet=json.dumps(ire)[:140]
    print(f"  {model:34} INFER [{ist}] {'OK' if ok else 'FAIL'}  {snippet}")
    results[model]=("ok" if ok else "infer_fail", ist)
    call("DELETE",f"{BASE}/v3/agents/{aid}",H)
print("\nRESULT:", json.dumps(results))
