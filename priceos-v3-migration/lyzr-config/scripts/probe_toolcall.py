#!/usr/bin/env python3
"""READ-ONLY: run inferences and capture tool-call / delegation evidence.
Test A: Aria with a property question + NO precomputed block (forces delegation/tools).
Test B: a single subagent (Booking Intelligence) directly asked to USE its tool — does it call it?"""
import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())
def infer(aid,msg,sess,t=180):
    r=urllib.request.Request(INFER,data=json.dumps({"user_id":"69ddea290b8d4053d2c698fd","agent_id":aid,"session_id":sess,"message":msg}).encode(),method="POST",headers=H)
    try:
        raw=urllib.request.urlopen(r,timeout=t).read().decode(); return json.loads(raw)
    except urllib.error.HTTPError as e: return {"_http":e.code,"_body":e.read().decode()[:300]}
    except Exception as e: return {"_err":str(e)}

L="69fac7212c1ef53a252a9f12"
# Test B first (faster): ask Booking Intelligence to fetch reservations via its tool
print("=== TEST B: subagent (Booking Intelligence) — does it CALL its tool? ===")
msgB=(f"org_id: 69ddea290b8d4053d2c698fd\nlisting_id: {L}\ndate_from: 2026-06-06\ndate_to: 2026-07-06\n\n"
      "No raw data blocks are provided. Use your get_property_reservations tool to fetch the booking list, then return your JSON.")
rB=infer(created["booking_intelligence"]["agent_id"],msgB,"probe-bk-tool-1",t=120)
print("top keys:",list(rB.keys()) if isinstance(rB,dict) else type(rB))
print("module_outputs:",json.dumps(rB.get("module_outputs",{}))[:500])
txtB=rB.get("response","") if isinstance(rB,dict) else str(rB)
print("response head:",txtB[:400])
