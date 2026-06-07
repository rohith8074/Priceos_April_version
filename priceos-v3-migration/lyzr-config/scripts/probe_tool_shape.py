#!/usr/bin/env python3
"""READ-ONLY: inspect HOW tools are attached vs how Lyzr expects them for execution.
Compare the agent.tools field shape + check if the registered tool set still resolves."""
import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
def call(m,u,t=40):
    try:
        x=urllib.request.urlopen(urllib.request.Request(u,method=m,headers=H),timeout=t);return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e:
        try:return e.code,json.loads(e.read().decode())
        except:return e.code,e.read().decode()[:200]
    except Exception as e:return 0,str(e)
created=json.loads(CREATED.read_text())
# 1. raw tools field on property_analyst
st,ag=call("GET",f"{BASE}/v3/agents/{created['property_analyst']['agent_id']}")
print("property_analyst.tools (raw):",json.dumps(ag.get("tools")))
print("type of first tool entry:",type((ag.get('tools') or [None])[0]).__name__)
# 2. list registered tools in Lyzr — does the toolset still exist?
st2,tools=call("GET",f"{BASE}/v3/tools/")
if isinstance(tools,dict): tools=tools.get("tools") or tools.get("tool_ids") or []
if isinstance(tools,list):
    names=[t.get("name") if isinstance(t,dict) else t for t in tools]
    pms=[n for n in names if n and ("priceos-pms" in str(n) or "calendar" in str(n))]
    print(f"\nregistered tools total: {len(names)}")
    print("PMS/calendar tools registered:", pms[:10])
    print("is get_property_calendar_metrics registered:", any("get_property_calendar_metrics" in str(n) for n in names))
else:
    print("\nGET /v3/tools/ ->",st2,str(tools)[:200])
