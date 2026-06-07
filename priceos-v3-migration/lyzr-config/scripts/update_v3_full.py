#!/usr/bin/env python3
"""
Bring all 8 PriceOS v3 agents up to the reference-agent standard.

Reference: agent 699d8ab150b4c733eb376fd4 + ../../../reference_prompt.md
For each agent this sets, exactly like the reference:
  agent_role            (1-line persona)
  agent_goal            (1-line objective)
  agent_instructions    (structured: Identity / Golden Rules / Tools table w/
                         proper descriptions / Structured Output JSON)
  tool_usage_description (per-tool when/how, fixes blank tool descriptions)
  response_format        (json_schema from the prompt file)
  tools                  (re-attached as name strings, descriptions enriched)

Also: enriches tool `description` in ../../schemas/openapi-contract.json,
re-registers both tool sets, and rewrites the prompts/*.md source files.

DRY RUN by default; --live to apply. Logs to ./update-log.txt. Stdlib only.
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
PROMPTS = LYZR / "prompts"
LOG = HERE / "update-log.txt"
BASE = "https://agent-prod.studio.lyzr.ai"

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

# ---- per-tool rich descriptions (fixes blank tool descriptions) ------------
TOOL_DESC = {
 "audit_log_decision": ("Persist this agent's decision to the PriceOS audit log.",
    "FINAL call of every turn, always.",
    "decision_id, parent_decision_id, property_id, inputs, outputs",
    "audit_decision_id"),
 "get_property_profile": ("Property identity & pricing limits.",
    "Need name/type/area/bedrooms/amenities or floor/ceiling price.",
    "property_id", "name, type, area, bedrooms, amenities, current/floor/ceiling price"),
 "get_property_calendar_metrics": ("Forward calendar state for a property.",
    "Occupancy, gaps, blocked nights, lead-time questions.",
    "property_id, dateFrom, dateTo", "occupancy %, booked/available/blocked nights, lead time"),
 "get_property_reservations": ("The booking list for a property.",
    "Velocity, LOS, channel mix, revenue analysis.",
    "property_id, dateFrom, dateTo", "reservations: guest, dates, revenue, channel, nights"),
 "get_property_benchmark": ("Competitor rate percentiles & positioning.",
    "Compare a property's ADR to the market.",
    "property_id, dateFrom, dateTo", "P25/P50/P75/P90, recommended rate, positioning verdict"),
 "get_portfolio_overview": ("Cross-property portfolio summary.",
    "Portfolio-level occupancy/cancellation/channel questions.",
    "org scope", "per-property occupancy, cancellations, channel mix"),
 "get_portfolio_revenue_snapshot": ("Portfolio revenue roll-up for a window.",
    "Revenue totals across properties.",
    "date window", "revenue by property + totals"),
 "regime_classify": ("Daily market regime score (0-1) for a city.",
    "FIRST in any market analysis; replaces the old news factor.",
    "city, date", "regime_score, label, trend, per-source-market modifiers, drivers"),
 "comps_get_state": ("Live comp-set state for a property.",
    "Competitive context for pricing or anomaly checks.",
    "property_id, target_window", "median/p25/p75 by date, WoW change, named movers"),
 "events_get_validated": ("Verified demand events in a window.",
    "Factor confirmed events into pricing/positioning.",
    "city, target_window, min_confidence", "events with confidence + expected premium band"),
 "source_market_get_modifier": ("Property-specific demand modifier by source-market mix.",
    "Make pricing source-market aware (e.g. Russian vs Indian demand).",
    "property_id, target_date", "modifier + per-segment breakdown"),
 "guest_signals_get_summary": ("Trailing guest sentiment for a property.",
    "Let guest experience inform pricing/positioning.",
    "property_id, window_days", "sentiment_score, complaint_categories, recurring_themes"),
 "elasticity_predict": ("P(book) & expected RevPAR for candidate prices from the learned model.",
    "THE pricing tool. ALWAYS call it; never compute price by formula.",
    "property_id, target_date, candidate_prices, features", "per-price p_book, expected_revpar, ci_95"),
 "exploration_select": ("Bandit decision to probe a non-greedy price.",
    "After choosing the exploit price (unbooked, lead_time>14d, in budget).",
    "property_id, target_date, exploit_choice, exploration_budget_remaining", "chosen_price, is_exploration"),
 "internet_search": ("Live web search for the intelligence sweep.",
    "Gathering events/geopolitics/weather/advisories. Built-in Lyzr tool.",
    "query", "search results"),
}

ROLE = {
 "aria": "You are Aria, the conversational AI Revenue Manager and orchestrator for PriceOS.",
 "property_analyst": "You are the Property Analyst for PriceOS, a single-property calendar and gap specialist.",
 "booking_intelligence": "You are the Booking Intelligence analyst for PriceOS.",
 "market_research": "You are the Market Research analyst for PriceOS.",
 "priceguard": "You are PriceGuard, the pricing-optimization agent for PriceOS.",
 "anomaly_detector": "You are the Anomaly Detector for PriceOS.",
 "atlas": "You are Atlas, the portfolio-intelligence assistant for PriceOS.",
 "event_intelligence": "You are the Event Intelligence agent for PriceOS.",
}
GOAL = {
 "aria": "Understand the manager's request, route it to the correct workflow, and translate structured agent outputs into clear, actionable revenue guidance.",
 "property_analyst": "Analyze one property's calendar, gap nights, and revenue forecast, and recommend LOS / min-stay / discount actions.",
 "booking_intelligence": "Quantify booking velocity, length-of-stay, channel mix, and ADR-vs-benchmark for a property.",
 "market_research": "Surface clean, plain-language market context (regime, comps, events, source-market, guest sentiment) for the pricing decision.",
 "priceguard": "Select the price that maximizes expected RevPAR over the learned elasticity model, within owner guardrails.",
 "anomaly_detector": "Monitor post-execution state and flag pricing anomalies using a regime-adjusted score.",
 "atlas": "Answer cross-property questions and flag portfolio-health issues with fresh data.",
 "event_intelligence": "Run a verified web-intelligence sweep and persist only confidence-scored events.",
}

def extract(md, header):
    i=md.find(header)
    if i==-1: return ""
    s=md.find("```",i)
    if s==-1: return ""
    bs=md.find("\n",s)+1; e=md.find("```",bs)
    return md[bs:e].strip() if e!=-1 else ""

def tools_table(tool_names):
    rows=["| Tool | When to Call | Key Inputs | Returns |","|---|---|---|---|"]
    for n in tool_names:
        d=TOOL_DESC.get(n)
        if d: rows.append(f"| `{n}` | {d[0]} {d[1]} | {d[2]} | {d[3]} |")
        else: rows.append(f"| `{n}` | (see tool schema) | - | - |")
    return "\n".join(rows)

def usage_desc(tool_names):
    return " ".join(f"{n}: {TOOL_DESC[n][0]} Call {TOOL_DESC[n][1]}"
                    for n in tool_names if n in TOOL_DESC)

def build_instructions(system_prompt, tool_names, schema):
    parts=[system_prompt,
           "\n\n## Tools Available (How & When to Use)\n"+tools_table(tool_names)]
    if schema:
        parts.append("\n\n## Structured Output (JSON Contract)\n"
                     "Respond with ONLY a single JSON object matching this schema "
                     "exactly — no prose outside the JSON.\n\n```json\n"+schema+"\n```")
    return "".join(parts)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--live",action="store_true")
    args=ap.parse_args()
    k=key(); H={"Content-Type":"application/json","x-api-key":k}
    agent_tools=json.loads(WF.read_text())["agent_tools"]
    created=json.loads(CREATED.read_text())
    agents={a:v["agent_id"] for a,v in created.items() if "agent_id" in v}
    prompt_files={
      "aria":"01-aria.md","property_analyst":"02-property-analyst.md",
      "booking_intelligence":"03-booking-intelligence.md","market_research":"04-market-research.md",
      "priceguard":"05-priceguard.md","anomaly_detector":"06-anomaly-detector.md",
      "atlas":"07-atlas.md","event_intelligence":"08-event-intelligence.md"}

    log("=== Update v3 agents to reference standard -", "LIVE" if args.live else "DRY RUN","===")

    # 1) enrich openapi-contract descriptions
    contract=json.loads(CONTRACT.read_text())
    for p,methods in contract["paths"].items():
        for m,o in methods.items():
            op=o.get("operationId")
            if op in TOOL_DESC:
                o["description"]=TOOL_DESC[op][0]+" Call "+TOOL_DESC[op][1]
    if args.live:
        CONTRACT.write_text(json.dumps(contract,indent=2)); log("  enriched openapi-contract.json")

    # 2) register tool sets -> name catalog
    def register(name,spec):
        st,b=call("POST",f"{BASE}/v3/tools/",H,
                  {"tool_set_name":name,"openapi_schema":spec,"enhance_descriptions":False})
        tools=b.get("tool_ids",[]) if isinstance(b,dict) else []
        log(f"  [{st}] register {name}: {len(tools)} tools")
        return tools
    catalog={}
    if args.live:
        for t in register("priceos-pms",json.loads(PMS_SPEC.read_text())) + register("priceos-v3-svc",contract):
            nm=t.get("name","")
            if nm: catalog[nm.split("-")[-1]]=nm
    def resolve(n):
        if n in catalog: return catalog[n]
        for op,nm in catalog.items():
            if nm.endswith("-"+n): return nm
        return None

    # 3) update each agent + rewrite md
    summary={}
    for a,aid in agents.items():
        names=agent_tools.get(a,[])
        sysp=extract((PROMPTS/prompt_files[a]).read_text(),"## SYSTEM PROMPT")
        schema=extract((PROMPTS/prompt_files[a]).read_text(),"## OUTPUT SCHEMA")
        instructions=build_instructions(sysp,names,schema)
        role,goal=ROLE[a],GOAL[a]
        ud=usage_desc(names)
        log(f"\n  [{a}] {aid}")
        log(f"    role: {role[:60]}...")
        log(f"    tools in table: {names}")

        # rewrite md source
        if args.live:
            md=(PROMPTS/prompt_files[a]).read_text()
            hdr=f"\n\n## Agent Role (Lyzr field)\n{role}\n\n## Agent Goal (Lyzr field)\n{goal}\n\n## Tools Available (How & When to Use)\n{tools_table(names)}\n"
            if "## Agent Role (Lyzr field)" not in md:
                # insert after first config table (before SYSTEM PROMPT)
                idx=md.find("## SYSTEM PROMPT")
                md=md[:idx]+hdr+"\n"+md[idx:] if idx!=-1 else md+hdr
                (PROMPTS/prompt_files[a]).write_text(md)

        if not args.live:
            summary[a]={"tools":names}; continue
        st,ag=call("GET",f"{BASE}/v3/agents/{aid}",H)
        if st!=200 or not isinstance(ag,dict):
            log(f"    GET failed [{st}]"); summary[a]={"err":st}; continue
        ag["agent_role"]=role; ag["agent_goal"]=goal
        ag["agent_instructions"]=instructions
        ag["tool_usage_description"]=ud
        if schema:
            try: ag["response_format"]={"type":"json_schema","json_schema":json.loads(schema)}
            except: pass
        resolved=[resolve(n) for n in names]; resolved=[r for r in resolved if r]
        if resolved: ag["tools"]=resolved
        ag["api_key"]=k
        st2,resp=call("PUT",f"{BASE}/v3/agents/{aid}",H,ag)
        log(f"    PUT [{st2}] {json.dumps(resp)[:120]} | instr {len(instructions)}c, tools {len(resolved)}")
        summary[a]={"put":st2,"tools":len(resolved)}

    log("\n=== SUMMARY ===\n"+json.dumps(summary,indent=2))
    _lf.close()

if __name__=="__main__":
    main()
