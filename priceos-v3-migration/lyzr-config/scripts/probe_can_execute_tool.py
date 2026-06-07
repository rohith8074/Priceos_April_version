#!/usr/bin/env python3
"""READ-ONLY: prove whether a Lyzr agent CAN execute a tool call at all.
Clone Property Analyst onto gpt-4.1 with a MINIMAL prompt that ONLY says 'call the tool',
no data blocks, no no-tools rule. If module_outputs shows a tool execution -> tooling works,
the blocker is purely the prompt. If still empty -> registration/ngrok blocks execution."""
import json,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent;ENV=HERE.parents[2]/".env";CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai";INFER=f"{BASE}/v3/inference/chat/"
k=[l.split("=",1)[1].strip().strip('"') for l in ENV.read_text().splitlines() if l.startswith("LYZR_API_KEY=")][0]
H={"Content-Type":"application/json","x-api-key":k}
def call(m,u,b=None,t=120):
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(u,data=d,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t);return x.status,json.loads(x.read().decode())
    except urllib.error.HTTPError as e:
        try:return e.code,json.loads(e.read().decode())
        except:return e.code,e.read().decode()[:200]
    except Exception as e:return 0,str(e)
created=json.loads(CREATED.read_text())
st,base=call("GET",f"{BASE}/v3/agents/{created['property_analyst']['agent_id']}")
# clone with minimal call-the-tool prompt
body=dict(base);body.pop("_id",None);body.pop("id",None)
body["name"]="zzz_tooltest"
body["provider_id"]="OpenAI";body["model"]="gpt-4.1";body["llm_credential_id"]="lyzr_openai"
body["agent_instructions"]=("You are a data fetcher. When asked, you MUST call the "
 "get_property_calendar_metrics tool with the given orgId, listingId, dateFrom, dateTo. "
 "After the tool returns, reply with the raw tool result. Always call the tool — never refuse.")
body.pop("response_format",None); body["api_key"]=k
cst,cre=call("POST",f"{BASE}/v3/agents/",body)
aid=cre.get("agent_id") if isinstance(cre,dict) else None
print("clone create:",cst,aid)
if aid:
    msg=("Call get_property_calendar_metrics with orgId=69ddea290b8d4053d2c698fd "
         "listingId=69fac7212c1ef53a252a9f12 dateFrom=2026-06-06 dateTo=2026-07-06 and return the result.")
    ist,resp=call("POST",INFER,{"user_id":"69ddea290b8d4053d2c698fd","agent_id":aid,"session_id":"tooltest-1","message":msg},t=150)
    print("infer status:",ist)
    print("module_outputs:",json.dumps(resp.get("module_outputs",{}))[:700] if isinstance(resp,dict) else resp)
    txt=resp.get("response","") if isinstance(resp,dict) else str(resp)
    print("response head:",txt[:400])
    # did it return real numbers (occupancyPct / bookedDays) proving the tool ran?
    print("CONTAINS occupancyPct:", "occupancyPct" in txt or "bookedDays" in txt or "29" in txt)
    call("DELETE",f"{BASE}/v3/agents/{aid}")
    print("(cleaned up clone)")
