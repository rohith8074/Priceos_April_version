#!/usr/bin/env python3
"""
Belt-and-suspenders: prepend a hard JSON-only / no-artifact rule to each worker
agent's instructions so the precompute orchestrator always gets parseable JSON.
(disable_artifacts is already set via no_artifacts.py; this reinforces it in the
prompt, which matters for Gemini.) GET-merge-PUT. Idempotent.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
BASE="https://agent-prod.studio.lyzr.ai"
WORKERS=["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]
RULE=("⛔ OUTPUT CONTRACT (HIGHEST PRIORITY): Return ONLY a single raw JSON object "
      "that matches the response schema. Do NOT create an artifact or file. Do NOT "
      "write any prose, preamble, explanation, or markdown code fences before or "
      "after the JSON. Your entire reply must start with '{' and end with '}'. An "
      "automated system parses your output as JSON and FAILS on any non-JSON text.\n\n")
MARKER="OUTPUT CONTRACT (HIGHEST PRIORITY)"
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
for name in WORKERS:
    aid=created.get(name,{}).get("agent_id")
    if not aid: continue
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict): print(f"{name}: GET [{st}]"); continue
    instr=ag.get("agent_instructions","") or ""
    if MARKER in instr:
        print(f"{name}: rule already present -> skip"); continue
    ag["agent_instructions"]=RULE+instr
    ag["api_key"]=k
    st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name:20} prepended rule  PUT [{st2}]  (instr {len(instr)}->{len(instr)+len(RULE)})")
