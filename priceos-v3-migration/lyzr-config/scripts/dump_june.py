import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";IDS=HERE/"june-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"x-api-key":k,"Content-Type":"application/json"}
def get(aid):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/v3/agents/{aid}",headers=H),timeout=40).read())
    except urllib.error.HTTPError as e: return {"_http":e.code,"_body":e.read().decode()[:150]}
    except Exception as e: return {"_err":str(e)}
ids=json.loads(IDS.read_text())
for name,v in ids.items():
    ag=get(v["agent_id"])
    if ag.get("_http") or ag.get("_err"):
        print(f"{name:22} ERR {ag}"); continue
    tools=[t if isinstance(t,str) else t.get("name") for t in (ag.get("tools") or [])]
    managed=[m.get("name") for m in (ag.get("managed_agents") or [])]
    rf=ag.get("response_format")
    rf_name=(rf or {}).get("json_schema",{}).get("name") if isinstance(rf,dict) else None
    instr=ag.get("agent_instructions","") or ""
    Path(f"/tmp/june_{name}.txt").write_text(instr)
    print(f"{name:22} model={ag.get('model'):22} instr={len(instr):5}c tools={len(tools)} managed={len(managed)} rf={rf_name}")
    print(f"   tools: {tools}")
    if managed: print(f"   managed: {managed}")
