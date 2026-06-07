#!/usr/bin/env python3
"""
Fix 3 agent misalignments found in audit (GET-merge-PUT, preserves all other fields):
  1. Aria  : model -> anthropic/claude-sonnet-4-6 (+ correct credential); strip trailing </content>.
  2. Atlas : drop non-existent tool get_portfolio_revenue_snapshot from prompt + tools list.
  3. EventIntelligence: enable Lyzr web search feature so its sweep can actually run.
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

def get(aid):
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    return (ag if st==200 and isinstance(ag,dict) else None)

def put(aid,ag,label):
    ag["api_key"]=k
    st,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"  {label}: PUT [{st}] {json.dumps(resp)[:120]}")

# 1. ARIA
aid=created["aria"]["agent_id"]
ag=get(aid)
if ag:
    before_model=ag.get("model")
    ag["provider_id"]="Anthropic"; ag["model"]="anthropic/claude-sonnet-4-6"; ag["llm_credential_id"]="lyzr_anthropic"
    instr=ag.get("agent_instructions","") or ""
    if "</content>" in instr:
        instr=instr.split("</content>")[0].rstrip()+"\n"
    ag["agent_instructions"]=instr
    print(f"ARIA model {before_model} -> anthropic/claude-sonnet-4-6 ; stripped </content>={'</content>' not in instr}")
    put(aid,ag,"aria")

# 2. ATLAS
aid=created["atlas"]["agent_id"]
ag=get(aid)
if ag:
    tools=ag.get("tools") or []
    new_tools=[t for t in tools if "revenue_snapshot" not in (t if isinstance(t,str) else str(t))]
    ag["tools"]=new_tools
    instr=ag.get("agent_instructions","") or ""
    # remove the tool from the "Tools you may call" list + the markdown table row
    instr=instr.replace("  get_portfolio_revenue_snapshot\n","")
    lines=[ln for ln in instr.splitlines() if "get_portfolio_revenue_snapshot" not in ln]
    ag["agent_instructions"]="\n".join(lines)
    print(f"ATLAS tools {len(tools)} -> {len(new_tools)} (removed revenue_snapshot); prompt rows cleaned")
    put(aid,ag,"atlas")

# 3. EVENT INTELLIGENCE — enable Lyzr web search feature
aid=created["event_intelligence"]["agent_id"]
ag=get(aid)
if ag:
    feats=ag.get("features") or []
    has_search=any((f.get("type")=="WEB_SEARCH" or "search" in str(f).lower()) for f in feats if isinstance(f,dict))
    if not has_search:
        feats.append({"type":"WEB_SEARCH","config":{},"priority":1})
    ag["features"]=feats
    print(f"EVENT_INTEL features -> {json.dumps(feats)[:160]}")
    put(aid,ag,"event_intelligence")

print("\n=== VERIFY ===")
for nm in ["aria","atlas","event_intelligence"]:
    ag=get(created[nm]["agent_id"])
    if ag:
        tools=ag.get("tools") or []
        tn=[t if isinstance(t,str) else t.get("name") for t in tools]
        print(f"{nm:20} model={ag.get('model')} tools={len(tools)} feats={len(ag.get('features') or [])} "
              f"hasSnapshot={'revenue_snapshot' in json.dumps(tn)} contentTag={'</content>' in (ag.get('agent_instructions') or '')}")
