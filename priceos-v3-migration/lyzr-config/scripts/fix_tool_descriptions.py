#!/usr/bin/env python3
"""
Fix per-tool descriptions on all v3 agents + point every tool at the ngrok URL.

Root cause of blank descriptions: Lyzr renders each tool's description from
tool_configs[].action_names (one entry per tool), NOT from the single
tool_usage_description string. The reference agent has a tool_configs entry per
tool. We replicate that.

Also: set the v3-service OpenAPI server URL to the ngrok tunnel so the tools are
reachable for testing (PMS spec already uses ngrok).

DEFAULT DRY RUN. --live applies. Logs to ./fix-tools-log.txt. Stdlib only.
"""
import argparse, json, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
LYZR = HERE.parent
MIG = LYZR.parent
PRICEOS = MIG.parent
ENV = PRICEOS / ".env"
WF = MIG / "schemas" / "workflow-registry.json"
CONTRACT = MIG / "schemas" / "openapi-contract.json"
PMS_SPEC = PRICEOS / "openapi-agent-tools-v1.json"
CREATED = HERE / "created-agent-ids.json"
LOG = HERE / "fix-tools-log.txt"
BASE = "https://agent-prod.studio.lyzr.ai"
NGROK = "https://sadistically-calycine-carry.ngrok-free.dev"

_lf = open(LOG, "w", encoding="utf-8")
def log(*a):
    s=" ".join(str(x) for x in a); print(s); _lf.write(s+"\n"); _lf.flush()

def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="): return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")

def call(method,url,H,body=None,t=90):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(url,data=data,method=method,headers=H)
    try:
        x=urllib.request.urlopen(r,timeout=t); raw=x.read().decode()
        try: return x.status,json.loads(raw)
        except: return x.status,raw
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try: return e.code,json.loads(raw)
        except: return e.code,raw
    except Exception as e: return 0,str(e)

# short, when, inputs, returns  -> assembled into a full standalone description
TOOL_DESC = {
 "audit_log_decision": ("Persist this agent's decision to the PriceOS audit log.","as the FINAL call of every turn, always.","decision_id, parent_decision_id, property_id, inputs, outputs","audit_decision_id"),
 "get_property_profile": ("Property identity and pricing limits.","when you need name/type/area/bedrooms/amenities or floor/ceiling price.","property_id","name, type, area, bedrooms, amenities, current/floor/ceiling price"),
 "get_property_calendar_metrics": ("Forward calendar state for a property.","for occupancy, gaps, blocked nights, or lead-time questions.","property_id, dateFrom, dateTo","occupancy %, booked/available/blocked nights, lead time"),
 "get_property_reservations": ("The booking list for a property.","for velocity, length-of-stay, channel mix, or revenue analysis.","property_id, dateFrom, dateTo","reservations: guest, dates, revenue, channel, nights"),
 "get_property_benchmark": ("Competitor rate percentiles and positioning.","to compare a property's ADR to the market.","property_id, dateFrom, dateTo","P25/P50/P75/P90, recommended rate, positioning verdict"),
 "get_portfolio_overview": ("Cross-property portfolio summary.","for portfolio-level occupancy, cancellation, or channel questions.","org scope","per-property occupancy, cancellations, channel mix"),
 "get_portfolio_revenue_snapshot": ("Portfolio revenue roll-up for a window.","for revenue totals across properties.","date window","revenue by property plus totals"),
 "regime_classify": ("Daily market regime score (0-1) for a city.","FIRST in any market analysis; it replaces the old news factor.","city, date","regime_score, label, trend, per-source-market modifiers, drivers"),
 "comps_get_state": ("Live comp-set state for a property.","for competitive context in pricing or anomaly checks.","property_id, target_window","median/p25/p75 by date, week-over-week change, named movers"),
 "events_get_validated": ("Verified demand events in a window.","to factor confirmed events into pricing or positioning.","city, target_window, min_confidence","events with confidence and expected premium band"),
 "source_market_get_modifier": ("Property-specific demand modifier from its source-market mix.","to make pricing source-market aware (e.g. Russian vs Indian demand).","property_id, target_date","modifier plus per-segment breakdown"),
 "guest_signals_get_summary": ("Trailing guest sentiment for a property.","to let guest experience inform pricing or positioning.","property_id, window_days","sentiment_score, complaint_categories, recurring_themes"),
 "elasticity_predict": ("P(book) and expected RevPAR for candidate prices from the learned demand model.","ALWAYS for pricing; never compute a price by formula.","property_id, target_date, candidate_prices, features","per-price p_book, expected_revpar, ci_95"),
 "exploration_select": ("Thompson-sampling bandit decision to probe a non-greedy price.","after choosing the exploit price (unbooked nights, lead_time>14d, within budget).","property_id, target_date, exploit_choice, exploration_budget_remaining","chosen_price, is_exploration"),
 "internet_search": ("Live web search for the intelligence sweep.","to gather events, geopolitics, weather, and advisories. Built-in Lyzr tool.","query","search results"),
}
def full_desc(n):
    d=TOOL_DESC[n]; return f"{d[0]} Call {d[1]} Inputs: {d[2]}. Returns: {d[3]}."

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--live",action="store_true"); args=ap.parse_args()
    k=key(); H={"Content-Type":"application/json","x-api-key":k}
    agent_tools=json.loads(WF.read_text())["agent_tools"]
    agents={a:v["agent_id"] for a,v in json.loads(CREATED.read_text()).items() if "agent_id" in v}
    log("=== Fix tool descriptions + ngrok URL -", "LIVE" if args.live else "DRY RUN","===")

    # 1) point v3-service tools at ngrok
    contract=json.loads(CONTRACT.read_text())
    contract["servers"]=[{"url":NGROK+"/api/agent-tools/v1","description":"ngrok -> Next agent-tools"}]
    if args.live:
        CONTRACT.write_text(json.dumps(contract,indent=2)); log("  set openapi-contract server ->", NGROK+"/api/agent-tools/v1")

    # 2) register both sets -> catalog op->full name
    catalog={}
    if args.live:
        for setname,spec in [("priceos-pms",json.loads(PMS_SPEC.read_text())),("priceos-v3-svc",contract)]:
            st,b=call("POST",f"{BASE}/v3/tools/",H,{"tool_set_name":setname,"openapi_schema":spec,"enhance_descriptions":False})
            tools=b.get("tool_ids",[]) if isinstance(b,dict) else []
            log(f"  [{st}] register {setname}: {len(tools)} tools")
            for t in tools:
                nm=t.get("name","")
                if nm: catalog[nm.split("-")[-1]]=nm
    def resolve(n):
        if n in catalog: return catalog[n]
        for op,nm in catalog.items():
            if nm.endswith("-"+n): return nm
        return None

    # 3) per-agent: build tool_configs with action_names per tool, then PUT
    summary={}
    for a,aid in agents.items():
        names=agent_tools.get(a,[])
        resolved=[(n,resolve(n)) for n in names]
        resolved=[(n,full) for n,full in resolved if full]   # drop builtins (internet_search)
        tools_arr=[full for _,full in resolved]
        tool_configs=[{
            "tool_name": full, "tool_source":"openapi",
            "action_names":[full_desc(n)],
            "persist_auth": True, "server_id":"", "provider_uuid":"", "credential_id":""
        } for n,full in resolved]
        usage={full:[full_desc(n)] for n,full in resolved}
        log(f"\n  [{a}] {aid}: {len(tool_configs)} tool_configs")
        for n,full in resolved: log(f"     {full} -> {full_desc(n)[:70]}...")
        if not args.live:
            summary[a]={"configs":len(tool_configs)}; continue
        st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
        if st!=200 or not isinstance(ag,dict):
            log(f"     GET failed [{st}]"); summary[a]={"err":st}; continue
        ag["tools"]=tools_arr
        ag["tool_configs"]=tool_configs
        ag["tool_usage_description"]=json.dumps(usage)
        ag["api_key"]=k
        st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
        log(f"     PUT [{st2}] {json.dumps(resp)[:120]}")
        summary[a]={"put":st2,"configs":len(tool_configs)}

    log("\n=== SUMMARY ===\n"+json.dumps(summary,indent=2))
    _lf.close()

if __name__=="__main__":
    main()
