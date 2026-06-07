import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
aria=json.loads(CREATED.read_text())["aria"]["agent_id"]
# Ask a DIRECT cache question to force a tool call, not full orchestration
msg=("org_id: 69ddea290b8d4053d2c698fd\nlisting_id: 69fac7212c1ef53a252a9f29\n"
     "date_from: 2026-06-06\ndate_to: 2026-07-06\n\n"
     "User Query: Call get_property_analysis for this listing and tell me the exact occupancy and revenue_forecast it returns. Do not delegate.")
r=urllib.request.Request(INFER,data=json.dumps({"user_id":"69ddea290b8d4053d2c698fd","agent_id":aria,"session_id":"cachecall-1","message":msg}).encode(),method="POST",headers=H)
resp=json.loads(urllib.request.urlopen(r,timeout=180).read().decode())
# dump full structure to see if tool_calls / module_outputs present
print("TOP KEYS:", list(resp.keys()) if isinstance(resp,dict) else type(resp))
print("module_outputs:", json.dumps(resp.get("module_outputs",{}))[:400])
txt=resp.get("response","")
print("RESPONSE head:", txt[:600])
