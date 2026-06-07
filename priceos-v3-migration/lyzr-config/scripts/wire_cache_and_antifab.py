#!/usr/bin/env python3
"""
1. Register the cache-reader OpenAPI spec with Lyzr (POST /v3/tools/).
2. Attach the 6 cache tools to Aria + prepend a READ-CACHE-FIRST + anti-fabrication
   instruction (keep its existing manager prompt body + audit tool).
3. Prepend an anti-fabrication rule to all 7 workers.
4. Re-pin Aria to claude-sonnet-4-6.
All GET-merge-PUT. Verify at the end.
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
CREATED=HERE/"created-agent-ids.json"
CACHE_SPEC=HERE.parents[1]/"schemas"/"openapi-cache.json"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(m,u,H,b=None,t=90):
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

ANTIFAB=("⛔ NO FABRICATION (HIGHEST PRIORITY): NEVER invent, guess, or synthesize "
 "numbers — regime scores, comp-set medians/percentiles, competitor moves, source-"
 "market shares, event names/dates/premiums, sentiment, ADR, occupancy. Use ONLY "
 "values present in the provided data blocks or returned by a tool. If a value is "
 "absent or a tool returns empty/zero/stub, report it as unavailable (0/[]/null) and "
 "note it in data_warnings[] — do NOT fill it with a plausible-looking number. "
 "Fabricated market intelligence is a critical failure.\n\n")

# ---- 1. register cache spec ----
spec=json.loads(CACHE_SPEC.read_text())
st,body=call("POST",f"{BASE}/v3/tools/",H,
             {"tool_set_name":"priceos-cache","openapi_schema":spec,"enhance_descriptions":False})
tools=body.get("tool_ids",[]) if isinstance(body,dict) else []
cache_tool_names=[t.get("name") for t in tools]
print(f"[register priceos-cache] [{st}] -> {cache_tool_names}")
if not cache_tool_names:
    print("  fallback to deterministic names"); 
    cache_tool_names=[f"openapi-priceos-cache-{op}" for op in
        ["get_property_analysis","get_booking_intelligence","get_market_research",
         "get_price_guard_report","get_anomaly_report","get_cache_status"]]

# ---- 2. Aria: attach cache tools + read-first + antifab + re-pin Claude ----
aria_id=created["aria"]["agent_id"]
st,ag=call("GET",f"{BASE}/v3/agents/{aria_id}",H)
existing=ag.get("tools") or []
merged=list(dict.fromkeys(existing+cache_tool_names))  # dedup, preserve order
ag["tools"]=merged
READFIRST=("⛔ READ THE CACHE FIRST (HIGHEST PRIORITY): For ANY property question, "
 "BEFORE delegating, call get_cache_status then the relevant get_property_analysis / "
 "get_booking_intelligence / get_market_research / get_price_guard_report / "
 "get_anomaly_report tools. These return the precomputed analyses for this "
 "listing+window — they are the AUTHORITATIVE source. Use their exact numbers "
 "(occupancy, revenue, prices, regime, comps). Only delegate to a sub-agent if the "
 "cache is missing for that area. NEVER state occupancy/revenue/market figures that "
 "contradict the cache.\n\n")
instr=ag.get("agent_instructions","") or ""
# strip prior copies of our rules to stay idempotent
for marker in ["⛔ READ THE CACHE FIRST","⛔ NO FABRICATION"]:
    if marker in instr: instr=instr.split(marker,1)[0]
ag["agent_instructions"]=READFIRST+ANTIFAB+instr
ag["provider_id"]="Anthropic"; ag["model"]="anthropic/claude-sonnet-4-6"; ag["llm_credential_id"]="lyzr_anthropic"
ag["api_key"]=k
pst,_=call("PUT",f"{BASE}/v3/agents/{aria_id}",H,ag)
print(f"[aria] tools {len(existing)}->{len(merged)}  model->claude-sonnet-4-6  PUT[{pst}]")

# ---- 3. antifab on 7 workers ----
WORKERS=["property_analyst","booking_intelligence","market_research","priceguard","anomaly_detector","atlas","event_intelligence"]
for w in WORKERS:
    aid=created[w]["agent_id"]
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200: print(f"[{w}] GET[{st}]"); continue
    instr=ag.get("agent_instructions","") or ""
    if "⛔ NO FABRICATION" in instr:
        print(f"[{w}] antifab already present -> skip"); continue
    ag["agent_instructions"]=ANTIFAB+instr
    ag["api_key"]=k
    pst,_=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"[{w}] +antifab PUT[{pst}]")

# ---- 4. verify ----
print("\n=== VERIFY ===")
st,ag=call("GET",f"{BASE}/v3/agents/{aria_id}",H)
print("aria model:",ag.get("model"),"| tools:",[t.split('-')[-1] for t in (ag.get('tools') or [])])
