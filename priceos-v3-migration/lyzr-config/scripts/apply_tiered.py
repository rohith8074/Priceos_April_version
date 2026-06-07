#!/usr/bin/env python3
"""
Apply the TIERED model assignment (corrected, no inversion):
  Aria (manager) -> Claude Sonnet 4.6   (Anthropic / anthropic/claude-sonnet-4-6 / lyzr_anthropic)
  7 workers      -> Gemini 3.0 Flash     (Google / gemini/gemini-3-flash-preview / lyzr_google)
Also PROBE Grok 4.1 fast model IDs (create+delete) and report which the account accepts.
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

CLAUDE=("Anthropic","anthropic/claude-sonnet-4-6","lyzr_anthropic")
GEMINI=("Google","gemini/gemini-3-flash-preview","lyzr_google")
created=json.loads(CREATED.read_text())
plan={"aria":CLAUDE}
for w in ["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]:
    plan[w]=GEMINI

print("=== APPLY TIERED (Aria=Claude, workers=Gemini) ===")
for name,(prov,model,cred) in plan.items():
    aid=created.get(name,{}).get("agent_id")
    if not aid: continue
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): print(f"{name}: GET [{st}]"); continue
    ag["provider_id"]=prov; ag["model"]=model; ag["llm_credential_id"]=cred; ag["api_key"]=k
    st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name:20} -> {model:35} PUT [{st2}]")

print("\n=== PROBE Grok 4.1 fast model IDs (create+delete) ===")
candidates=[
 ("xai","xai/grok-4.1-fast-reasoning","lyzr_xai"),
 ("xai","grok-4.1-fast-reasoning","lyzr_xai"),
 ("xAI","grok-4.1-fast-reasoning","lyzr_xai"),
 ("Groq","groq/grok-4.1-fast-reasoning","lyzr_groq"),
 ("xai","xai/grok-4.1-fast-non-reasoning","lyzr_xai"),
 ("xai","grok-4.1-fast-non-reasoning","lyzr_xai"),
 ("xai","xai/grok-4-fast-reasoning","lyzr_xai"),
]
valid=[]
for prov,model,cred in candidates:
    body={"api_key":k,"name":"ZZ_grokprobe","description":"t","agent_role":"t","agent_instructions":"t",
          "provider_id":prov,"model":model,"llm_credential_id":cred,"temperature":0.0,"top_p":1,"features":[],"tools":[]}
    st,d=call("POST",f"{BASE}/v3/agents/",H,body)
    if 200<=st<300:
        aid=d.get("agent_id") if isinstance(d,dict) else None
        dl=call("DELETE",f"{BASE}/v3/agents/{aid}",H)[0] if aid else "noid"
        print(f"VALID    {prov} / {model}  (deleted->{dl})"); valid.append((prov,model,cred))
    else:
        det=d.get("detail") if isinstance(d,dict) else d
        print(f"invalid  {prov} / {model}  [{st}] {str(det)[:90]}")
print("\nVALID GROK:", valid)
