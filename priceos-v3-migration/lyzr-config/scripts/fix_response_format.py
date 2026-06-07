#!/usr/bin/env python3
"""
Fix malformed response_format on the v3 agents.

Bug: agents were created with response_format = {"type":"json_schema",
"json_schema": <raw schema>}. litellm's Anthropic adapter does
value["json_schema"]["schema"] -> KeyError 'schema'. Correct OpenAI shape is
{"type":"json_schema","json_schema":{"name":..., "schema": <raw schema>,
"strict": false}}. GET-merge-PUT each agent; rewrap only if malformed.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(m,u,H,b=None,t=60):
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(u,data=d,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t); raw=x.read().decode()
        try: return x.status,json.loads(raw)
        except: return x.status,raw
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try: return e.code,json.loads(raw)
        except: return e.code,raw
    except Exception as e: return 0,str(e)
k=key(); H={"Content-Type":"application/json","x-api-key":k}
created=json.loads(CREATED.read_text())
for name,v in created.items():
    aid=v.get("agent_id")
    if not aid: continue
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict):
        print(f"{name}: GET [{st}]"); continue
    rf=ag.get("response_format")
    if not (isinstance(rf,dict) and rf.get("type")=="json_schema"):
        print(f"{name}: no json_schema response_format -> skip ({rf if not rf else 'type='+str(rf.get('type'))})"); continue
    js=rf.get("json_schema")
    if isinstance(js,dict) and "schema" in js:
        print(f"{name}: already correct (has json_schema.schema) -> skip"); continue
    # malformed: js IS the raw schema. Rewrap.
    fixed={"type":"json_schema","json_schema":{"name":f"{name}_response","schema":js,"strict":False}}
    ag["response_format"]=fixed; ag["api_key"]=k
    st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name}: REWRAPPED + PUT [{st2}] {json.dumps(resp)[:80]}")
