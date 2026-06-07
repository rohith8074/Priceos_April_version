#!/usr/bin/env python3
"""READ-ONLY probe: how does Aria handle a data question?
 - Inspect managed_agents wiring + each subagent's tools.
 - Run one inference and capture any tool-call / delegation evidence in the response."""
import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
def get(aid):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/v3/agents/{aid}",headers=H),timeout=40).read())
    except Exception as e: return {"err":str(e)}
created=json.loads(CREATED.read_text())

# 1. Aria managed_agents + its own tools
aria=get(created["aria"]["agent_id"])
print("=== ARIA ===")
print("model:",aria.get("model"))
print("own tools:",[t if isinstance(t,str) else t.get("name") for t in (aria.get("tools") or [])])
ma=aria.get("managed_agents") or []
print("managed_agents:",[(m.get("name"),m.get("id")) for m in ma])

# 2. Do the managed subagents actually have tools to call?
print("\n=== SUBAGENT TOOLS (can they fetch data?) ===")
name2key={"Property Analyst":"property_analyst","Booking Intelligence":"booking_intelligence",
 "Market Research":"market_research","PriceGuard":"priceguard","Anomaly Detector":"anomaly_detector",
 "Atlas":"atlas","Event Intelligence":"event_intelligence"}
for m in ma:
    ky=name2key.get(m.get("name"))
    if not ky: continue
    sa=get(created[ky]["agent_id"])
    tools=[t if isinstance(t,str) else t.get("name") for t in (sa.get("tools") or [])]
    print(f"  {m.get('name'):22} model={sa.get('model'):14} tools={[t.split('-')[-1] for t in tools]}")
