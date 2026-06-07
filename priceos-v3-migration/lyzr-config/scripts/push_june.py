#!/usr/bin/env python3
"""Complete the 8 June agents: prompts (v3-final), strict response_format, tool fixes,
tool_configs (per-tool descriptions), Aria managed_agents + cache tools. GET-merge-PUT."""
import json,sys,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
ENV=HERE.parents[2]/".env"
IDS=HERE/"june-agent-ids.json"
VF=HERE.parents[2]/"updated_prompts_2"/"v3-final"
BASE="https://agent-prod.studio.lyzr.ai"
def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")
def call(m,u,H,b=None,t=90):
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(u,data=d,method=m,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t);raw=x.read().decode()
        try:return x.status,json.loads(raw)
        except:return x.status,raw
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try:return e.code,json.loads(raw)
        except:return e.code,raw
    except Exception as e:return 0,str(e)
k=key();H={"Content-Type":"application/json","x-api-key":k}
ids=json.loads(IDS.read_text())
schemas=json.loads(Path("/tmp/schemas.json").read_text())
PROMPT_FILE={
 "aria":"01-aria-cro-router.md","property_analyst":"02-property-analyst.md",
 "booking_intelligence":"03-booking-intelligence.md","market_research":"04-market-research.md",
 "priceguard":"05-priceguard.md","anomaly_detector":"06-anomaly-detector.md",
 "atlas":"07-atlas.md","event_intelligence":"08-event-intelligence.md"}

# desired tool NAME lists (Lyzr 'openapi-<set>-<op>' strings already registered in account)
PMS="openapi-priceos-pms-"; SVC="openapi-priceos-v3-svc-"; CACHE="openapi-priceos-cache-"
TOOLS={
 "aria":[CACHE+"get_cache_status",CACHE+"get_property_analysis",CACHE+"get_booking_intelligence",
         CACHE+"get_market_research",CACHE+"get_price_guard_report",CACHE+"get_anomaly_report",SVC+"audit_log_decision"],
 "property_analyst":[PMS+"get_property_profile",PMS+"get_property_calendar_metrics",PMS+"get_property_reservations",SVC+"audit_log_decision"],
 "booking_intelligence":[PMS+"get_property_reservations",PMS+"get_property_benchmark",SVC+"audit_log_decision"],
 "market_research":[SVC+"regime_classify",SVC+"comps_get_state",SVC+"events_get_validated",SVC+"source_market_get_modifier",SVC+"guest_signals_get_summary",SVC+"audit_log_decision"],
 "priceguard":[SVC+"elasticity_predict",SVC+"exploration_select",PMS+"get_property_benchmark",SVC+"audit_log_decision"],
 "anomaly_detector":[PMS+"get_property_calendar_metrics",PMS+"get_property_reservations",SVC+"comps_get_state",SVC+"regime_classify",SVC+"audit_log_decision"],
 "atlas":[PMS+"get_portfolio_overview",PMS+"get_property_calendar_metrics",SVC+"audit_log_decision"],
 "event_intelligence":[SVC+"audit_log_decision"],
}
# per-tool descriptions (action_names) -> fixes blank tool descriptions in UI
DESC={
 "get_property_profile":"Property identity + pricing limits (name, area, city, bedrooms, basePrice, priceFloor, priceCeiling). Inputs: orgId, listingId.",
 "get_property_calendar_metrics":"Occupancy %, booked/blocked/bookable nights, ADR, revenue for a window (reservation-fallback aware). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_property_reservations":"Reservations overlapping a window (guest, channel, dates, nights, totalPrice, status). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_property_benchmark":"Competitor rate percentiles P25/P50/P75/P90 + recommended rate + positioning. Inputs: orgId, listingId.",
 "get_portfolio_overview":"Cross-property portfolio summary (per-property occupancy/revenue/ADR + totals). Inputs: orgId, dateFrom, dateTo.",
 "regime_classify":"Daily market regime score for a city (neutral stub until ML deployed). Inputs: city, date.",
 "comps_get_state":"Live comp-set median/p25/p75, WoW change, movers (REAL airbtics data). Inputs: orgId, listingId.",
 "events_get_validated":"Verified demand events in the window with confidence. Inputs: orgId, dateFrom, dateTo.",
 "source_market_get_modifier":"Property source-market demand modifier (neutral stub). Inputs: orgId, listingId.",
 "guest_signals_get_summary":"Trailing guest sentiment summary. Inputs: orgId, listingId.",
 "elasticity_predict":"P(book)/RevPAR per candidate price (stub until model deployed). Inputs: orgId, listingId, target_date.",
 "exploration_select":"Bandit decision to probe a non-greedy price (stub). Inputs: orgId.",
 "audit_log_decision":"Persist this agent's decision; returns audit_decision_id. Input: agent_name.",
 "get_cache_status":"Which precomputed analyses are fresh/stale/missing. Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_property_analysis":"Cached PropertyAnalyst output (AUTHORITATIVE occupancy/gaps/forecast). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_booking_intelligence":"Cached BookingIntelligence output (velocity/LOS/channels/ADR). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_market_research":"Cached MarketResearch output (regime/comps/events/sentiment). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_price_guard_report":"Cached PriceGuard decision (chosen price/verdict/guardrails). Inputs: orgId, listingId, dateFrom, dateTo.",
 "get_anomaly_report":"Cached AnomalyDetector report (score/severity/rollback). Inputs: orgId, listingId, dateFrom, dateTo.",
}
def op_of(toolname): return toolname.split("-")[-1]
def rf(name):
    s=schemas[name]
    return {"type":"json_schema","json_schema":{"name":s["name"],"strict":True,"schema":s["schema"]}}

ARIA_MANAGED_NAMES={"property_analyst":"Property Analyst","booking_intelligence":"Booking Intelligence",
 "market_research":"Market Research","priceguard":"PriceGuard","anomaly_detector":"Anomaly Detector",
 "atlas":"Atlas","event_intelligence":"Event Intelligence"}
ARIA_USAGE={"property_analyst":"Calendar, gap nights, LOS/min-stay, revenue forecast.",
 "booking_intelligence":"Velocity, LOS distribution, channel mix, ADR-vs-benchmark.",
 "market_research":"Regime, comp-set, validated events, source-market mix, sentiment.",
 "priceguard":"Max-RevPAR price + guardrail verdict. ANY pricing decision.",
 "anomaly_detector":"Anomalies / rollback recommendations.",
 "atlas":"Portfolio / cross-property questions.",
 "event_intelligence":"Verified web sweep for events/holidays/geopolitics."}

for name,v in ids.items():
    aid=v["agent_id"]
    st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
    if st!=200 or not isinstance(ag,dict):
        print(f"{name:20} GET[{st}] SKIP"); continue
    ag["agent_instructions"]=(VF/PROMPT_FILE[name]).read_text()
    ag["tools"]=TOOLS[name]
    ag["response_format"]=rf(name)
    ag["tool_configs"]=[{"tool_name":t,"tool_source":"openapi","action_names":[DESC.get(op_of(t),op_of(t))],
        "persist_auth":True,"server_id":"","provider_uuid":"","credential_id":""} for t in TOOLS[name]]
    ag["tool_usage_description"]=" | ".join(f"{op_of(t)}: {DESC.get(op_of(t),'')}" for t in TOOLS[name])
    if name=="aria":
        ag["managed_agents"]=[{"id":ids[wk]["agent_id"],"name":ARIA_MANAGED_NAMES[wk],"usage_description":ARIA_USAGE[wk]} for wk in ARIA_MANAGED_NAMES]
    ag["api_key"]=k
    pst,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
    print(f"{name:20} PUT[{pst}] tools={len(TOOLS[name])} rf={schemas[name]['name']} managed={len(ag.get('managed_agents') or [])}")
