#!/usr/bin/env python3
"""Dump live config (model, tools, managed_agents, instructions length+head) for all 8 agents."""
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
def call(m,u,H,t=60):
    r=urllib.request.Request(u,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t); return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e:
        return e.code,e.read().decode("utf-8","replace")
    except Exception as e: return 0,str(e)
k=key(); H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())
out={}
for name,v in created.items():
    aid=v.get("agent_id")
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict):
        out[name]={"err":st}; continue
    tools=ag.get("tools") or []
    tnames=[t if isinstance(t,str) else (t.get("name") or t.get("id")) for t in tools]
    managed=ag.get("managed_agents") or []
    mnames=[m.get("name") for m in managed]
    instr=ag.get("agent_instructions") or ""
    out[name]={
        "model":ag.get("model"),
        "tools":tnames,
        "managed_agents":mnames,
        "instr_len":len(instr),
        "instr_head":instr[:600],
    }
Path("/tmp/agents_dump.json").write_text(json.dumps(out,indent=2))
for name,d in out.items():
    print("="*70)
    print(f"{name}  model={d.get('model')}  instr={d.get('instr_len')}c")
    print(f"  tools({len(d.get('tools',[]))}): {d.get('tools')}")
    if d.get('managed_agents'): print(f"  managed_agents: {d.get('managed_agents')}")
