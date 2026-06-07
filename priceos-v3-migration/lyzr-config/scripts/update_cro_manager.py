#!/usr/bin/env python3
"""
Make Aria (CRO Router) a Lyzr MANAGER agent:
  - attach the 7 worker sub-agents as managed_agents (enables the Manager toggle)
  - install the new manager prompt (updated_prompts_2/01-cro-router.md)
  - enforce STRUCTURED-OUTPUT-ONLY via response_format (json_schema, strict)
GET-merge-PUT so all other Aria fields (tools, model, etc.) are preserved.

DRY RUN by default; --live to apply. Logs to ./cro-manager-log.txt. Stdlib only.
"""
import argparse, json, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
LYZR = HERE.parent
MIG = LYZR.parent
PRICEOS = MIG.parent
ENV = PRICEOS / ".env"
CREATED = HERE / "created-agent-ids.json"
PROMPT_FILE = PRICEOS / "updated_prompts_2" / "01-cro-router.md"
LOG = HERE / "cro-manager-log.txt"
BASE = "https://agent-prod.studio.lyzr.ai"

_lf = open(LOG, "w", encoding="utf-8")
def log(*a):
    s = " ".join(str(x) for x in a); print(s); _lf.write(s + "\n"); _lf.flush()

def key():
    for l in ENV.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="):
            return l.split("=", 1)[1].strip().strip('"')
    sys.exit("no key")

def call(method, url, H, body=None, t=90):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=H)
    try:
        x = urllib.request.urlopen(r, timeout=t); raw = x.read().decode()
        try: return x.status, json.loads(raw)
        except: return x.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(raw)
        except: return e.code, raw
    except Exception as e:
        return 0, str(e)

# worker key -> (display name, when-to-use)
WORKERS = {
    "property_analyst":     ("Property Analyst",     "Single-property calendar, gap nights, LOS/min-stay suggestions, and revenue forecast. Call for occupancy, gaps, calendar, or forecast questions."),
    "booking_intelligence": ("Booking Intelligence", "Booking velocity, length-of-stay distribution, channel mix, day-of-week, and ADR-vs-benchmark. Call for pace, velocity, channels, or revenue-breakdown questions."),
    "market_research":      ("Market Research",      "Market regime, competitor comp-set, validated events, source-market mix, and guest sentiment. Call for competitor, market, event, or demand questions."),
    "priceguard":           ("PriceGuard",           "The pricing optimizer: selects the max-expected-RevPAR price over the elasticity model plus a guardrail verdict. Call for ANY pricing decision — Aria never prices itself."),
    "anomaly_detector":     ("Anomaly Detector",     "Post-execution monitoring; flags anomalies and recommends rollback. Call for 'anything weird?' / 'is something wrong?'."),
    "atlas":                ("Atlas",                "Portfolio / cross-property questions: revenue, occupancy, and comparisons across many listings."),
    "event_intelligence":   ("Event Intelligence",   "Verified web sweep for events, holidays, and geopolitical signals. Call when fresh external event data is needed."),
}

# strict structured-output schema — every property required, additionalProperties false
RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "cro_router_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "intent": {"type": "string"},
                "answered_directly": {"type": "boolean"},
                "agents_consulted": {"type": "array", "items": {"type": "string"}},
                "narrative": {"type": "string"},
                "proposals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "proposal_id": {"type": "string"},
                            "date": {"type": "string"},
                            "current_price": {"type": "number"},
                            "proposed_price": {"type": "number"},
                            "change_pct": {"type": "number"},
                            "guard_verdict": {"type": "string", "enum": ["approved", "flag_review", "hard_block", "hold_for_review"]},
                            "expected_revpar": {"type": "number"},
                            "rationale": {"type": "string"},
                        },
                        "required": ["proposal_id", "date", "current_price", "proposed_price", "change_pct", "guard_verdict", "expected_revpar", "rationale"],
                        "additionalProperties": False,
                    },
                },
                "action_buttons": {"type": "array", "items": {"type": "string"}},
                "escalations": {"type": "array", "items": {"type": "string"}},
                "audit_decision_id": {"type": "string"},
            },
            "required": ["intent", "answered_directly", "agents_consulted", "narrative", "proposals", "action_buttons", "escalations", "audit_decision_id"],
            "additionalProperties": False,
        },
    },
}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--live", action="store_true"); args = ap.parse_args()
    k = key(); H = {"Content-Type": "application/json", "x-api-key": k}
    created = json.loads(CREATED.read_text())
    aria_id = created["aria"]["agent_id"]
    instructions = PROMPT_FILE.read_text(encoding="utf-8")

    managed = []
    for wk, (name, usage) in WORKERS.items():
        aid = created.get(wk, {}).get("agent_id")
        if not aid:
            log(f"  WARN missing id for {wk}"); continue
        managed.append({"id": aid, "name": name, "usage_description": usage})

    log("=== Make Aria a Manager Agent -", "LIVE" if args.live else "DRY RUN", "===")
    log(f"  aria_id: {aria_id}")
    log(f"  managed_agents: {[m['name'] for m in managed]} ({len(managed)})")
    log(f"  instructions: {len(instructions)} chars | response_format: strict json_schema")

    # GET current Aria to discover the manager flag field + preserve everything
    st, ag = call("GET", f"{BASE}/v3/agents/{aria_id}", H)
    if st != 200 or not isinstance(ag, dict):
        log(f"  GET failed [{st}] {str(ag)[:200]}"); _lf.close(); return
    manager_keys = [key for key in ag.keys() if "manag" in key.lower()]
    log(f"  existing manager-related fields: {manager_keys}")

    if not args.live:
        log("\n  [dry run] would set: managed_agents, agent_instructions, response_format,")
        log("            and any discovered manager flag. Re-run with --live.")
        _lf.close(); return

    ag["managed_agents"] = managed
    ag["agent_instructions"] = instructions
    ag["response_format"] = RESPONSE_FORMAT
    # Best-effort manager flag (covers known Lyzr variants). Harmless if ignored.
    ag["is_manager_agent"] = True
    ag["manager_agent"] = True
    ag["api_key"] = k

    st2, resp = call("PUT", f"{BASE}/v3/agents/{aria_id}", H, ag)
    log(f"  PUT [{st2}] {json.dumps(resp)[:200]}")

    # verify
    st3, ag2 = call("GET", f"{BASE}/v3/agents/{aria_id}", H)
    if st3 == 200 and isinstance(ag2, dict):
        log(f"  VERIFY managed_agents={len(ag2.get('managed_agents') or [])} "
            f"resp_format={'set' if ag2.get('response_format') else 'none'} "
            f"instr={len(ag2.get('agent_instructions') or '')}c")
    _lf.close()

if __name__ == "__main__":
    main()
