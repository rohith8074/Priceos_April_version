import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent; ENV=HERE.parents[2]/".env"; CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"x-api-key":k,"Content-Type":"application/json"}
def call(m,u,b=None):
    d=json.dumps(b).encode() if b is not None else None
    try:
        x=urllib.request.urlopen(urllib.request.Request(u,data=d,method=m,headers=H),timeout=60); return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return e.code,e.read().decode("utf-8","replace")
aid=json.loads(CREATED.read_text())["aria"]["agent_id"]
st,ag=call("GET",f"{BASE}/v3/agents/{aid}")
before=ag.get("model")
ag["provider_id"]="Anthropic"; ag["model"]="anthropic/claude-sonnet-4-6"; ag["llm_credential_id"]="lyzr_anthropic"; ag["api_key"]=k
pst,_=call("PUT",f"{BASE}/v3/agents/{aid}",ag)
st2,ag2=call("GET",f"{BASE}/v3/agents/{aid}")
print(f"Aria {before} -> {ag2.get('model')}  PUT[{pst}]  name={ag2.get('name')}  managed_agents={len(ag2.get('managed_agents') or [])}")
