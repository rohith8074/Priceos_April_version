import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())
L="69fac7212c1ef53a252a9f12"
# Aria, property question, NO precomputed block -> must delegate or call tools
msg=(f"org_id: 69ddea290b8d4053d2c698fd\nlisting_id: {L}\ndate_from: 2026-06-06\ndate_to: 2026-07-06\n"
     "property_name: NH Luxury 1BR\n\nUser Query: What is the current occupancy and how many reservations does this property have?")
r=urllib.request.Request(INFER,data=json.dumps({"user_id":"69ddea290b8d4053d2c698fd","agent_id":created["aria"]["agent_id"],"session_id":"probe-aria-deleg-2","message":msg}).encode(),method="POST",headers=H)
try:
    resp=json.loads(urllib.request.urlopen(r,timeout=200).read().decode())
except Exception as e:
    print("ERR",e); raise SystemExit
print("top keys:",list(resp.keys()))
print("module_outputs:",json.dumps(resp.get("module_outputs",{}))[:600])
txt=resp.get("response","")
# parse JSON to read agents_consulted + answered_directly
try:
    j=json.loads(txt.strip())
    print("answered_directly:",j.get("answered_directly"))
    print("agents_consulted:",j.get("agents_consulted"))
    print("narrative head:",(j.get("narrative") or "")[:400])
except:
    print("response head:",txt[:500])
