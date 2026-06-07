#!/usr/bin/env python3
"""Update June Aria: new prompt (SERP-aware) + add 3 live SERP-fed tools + re-pin model.
Keep cache tools + audit + managed_agents. GET-merge-PUT."""
import json,sys,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env"
ARIA="6a244404c8c1c80cc7abe76e"
PROMPT=HERE.parents[2]/"updated_prompts_2"/"v3-final"/"01-aria-cro-router.md"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(m,u,H,b=None,t=90):
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(u,data=d,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t);raw=x.read().decode()
        try:return x.status,json.loads(raw)
        except:return x.status,raw
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try:return e.code,json.loads(raw)
        except:return e.code,raw
    except Exception as e:return 0,str(e)
k=key();H={"Content-Type":"application/json","x-api-key":k}
st,ag=call("GET",f"{BASE}/v3/agents/{ARIA}",H)
if st!=200: sys.exit(f"GET failed {st}")

SVC="openapi-priceos-v3-svc-"
NEW=[SVC+"events_get_validated",SVC+"comps_get_state",SVC+"guest_signals_get_summary"]
existing=ag.get("tools") or []
tools=list(dict.fromkeys(existing+NEW))
DESC={
 "events_get_validated":"Live SERP-fed verified demand events in the window. Inputs: orgId, dateFrom, dateTo.",
 "comps_get_state":"Live competitor rate state (median/p25/p75, movers). Inputs: orgId, listingId.",
 "guest_signals_get_summary":"Live trailing guest sentiment summary. Inputs: orgId, listingId.",
}
# preserve existing tool_configs, append for the 3 new
def op(t): return t.split("-")[-1]
tc=ag.get("tool_configs") or []
have={c.get("tool_name") for c in tc}
for t in NEW:
    if t not in have:
        tc.append({"tool_name":t,"tool_source":"openapi","action_names":[DESC[op(t)]],
                   "persist_auth":True,"server_id":"","provider_uuid":"","credential_id":""})
ag["tools"]=tools
ag["tool_configs"]=tc
ag["agent_instructions"]=PROMPT.read_text()
ag["provider_id"]="Anthropic";ag["model"]="claude-haiku-4-5";ag["llm_credential_id"]="lyzr_anthropic"
ag["api_key"]=k
pst,resp=call("PUT",f"{BASE}/v3/agents/{ARIA}",H,ag)
print(f"PUT[{pst}] tools={len(tools)} tool_configs={len(tc)} model->claude-haiku-4-5")
# verify
st2,ag2=call("GET",f"{BASE}/v3/agents/{ARIA}",H)
print("VERIFY tools:",[t.split('-')[-1] for t in (ag2.get('tools') or [])])
print("VERIFY model:",ag2.get('model'),"managed:",len(ag2.get('managed_agents') or []),"instr:",len(ag2.get('agent_instructions') or ''),"c")
