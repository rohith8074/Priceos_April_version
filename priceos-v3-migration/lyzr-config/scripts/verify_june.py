import json,urllib.request
from pathlib import Path
ENV=Path('.').resolve().parents[2]/'.env';IDS=Path('june-agent-ids.json')
k=[l.split('=',1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith('LYZR_API_KEY=')][0]
H={"x-api-key":k};BASE="https://agent-prod.studio.lyzr.ai"
for name,v in json.loads(IDS.read_text()).items():
    ag=json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/v3/agents/{v['agent_id']}",headers=H),timeout=30).read())
    tools=[t if isinstance(t,str) else t.get("name") for t in (ag.get("tools") or [])]
    tc=ag.get("tool_configs") or []
    tc_ok=all(c.get("tool_source")=="openapi" and c.get("action_names") for c in tc)
    rf=(ag.get("response_format") or {}).get("json_schema",{}).get("name")
    managed=len(ag.get("managed_agents") or [])
    phantom="revenue_snapshot" in json.dumps(tools)
    print(f"{name:20} model={ag.get('model'):18} instr={len(ag.get('agent_instructions') or '')}c tools={len(tools)} tc_ok={tc_ok} rf={rf} managed={managed} phantom={phantom}")
