import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env"
BASE="https://agent-prod.studio.lyzr.ai"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
# try several list endpoints/shapes
for path in ["/v3/tools/","/v3/tools","/v3/tool/","/v3/tool-sets/"]:
    try:
        x=urllib.request.urlopen(urllib.request.Request(BASE+path,headers=H),timeout=30)
        body=json.loads(x.read().decode())
        n = len(body) if isinstance(body,list) else (len(body.get("tools",body.get("tool_ids",[]))) if isinstance(body,dict) else "?")
        print(f"GET {path} -> {x.status}, items={n}, sample={json.dumps(body)[:200]}")
    except urllib.error.HTTPError as e:
        print(f"GET {path} -> {e.code} {e.read().decode()[:80]}")
    except Exception as e:
        print(f"GET {path} -> ERR {e}")
