import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
aria=json.loads(CREATED.read_text())["aria"]["agent_id"]
# envelope mirrors what /api/chat sends (org/listing/date + query) for the 96.8% listing
msg=("org_id: 69ddea290b8d4053d2c698fd\n"
     "listing_id: 69fac7212c1ef53a252a9f29\n"
     "date_from: 2026-06-06\ndate_to: 2026-07-06\n"
     "property_name: NH Style Modern Studio | Balcony | Pool | Meydan\n\n"
     "User Query: What is my occupancy next month and how should I price?")
r=urllib.request.Request(INFER,data=json.dumps({"user_id":"69ddea290b8d4053d2c698fd","agent_id":aria,"session_id":"e2e-occ-test-1","message":msg}).encode(),method="POST",headers=H)
try:
    resp=json.loads(urllib.request.urlopen(r,timeout=180).read().decode())
except urllib.error.HTTPError as e:
    print("HTTP",e.code,e.read().decode()[:300]); raise SystemExit
txt=resp.get("response","") if isinstance(resp,dict) else str(resp)
print("=== ARIA RESPONSE (first 1500 chars) ===")
print(txt[:1500])
low=txt.lower()
print("\n=== CHECKS ===")
print("mentions 96.8 / 97 occupancy:", ("96.8" in txt) or ("97%" in txt) or ("96%" in txt))
print("WRONG: claims 0% occupancy:", "0% occupancy" in low or "0 percent" in low)
print("fabricated horse racing:", "horse racing" in low)
print("fabricated regime 0.68:", "0.68" in txt)
