import json,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"x-api-key":k,"Content-Type":"application/json"}
aid=json.loads(CREATED.read_text())["aria"]["agent_id"]
d=json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/v3/agents/{aid}",headers=H),timeout=30).read())
tools=[t if isinstance(t,str) else t.get("name") for t in (d.get("tools") or [])]
managed=[(m.get("name"),m.get("id")) for m in (d.get("managed_agents") or [])]
print("ARIA model:",d.get("model"))
print("ARIA tools:",tools)
print("ARIA managed_agents:",[m[0] for m in managed])
# does it have any cache-reading tool?
cache_tools=[t for t in tools if any(x in str(t) for x in ['property-analysis','booking-intelligence','market-research','price-guard','anomaly-report','cache'])]
print("ARIA cache-reader tools:", cache_tools or "NONE — Aria cannot read the precompute cache!")
