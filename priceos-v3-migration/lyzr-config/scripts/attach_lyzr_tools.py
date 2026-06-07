#!/usr/bin/env python3
"""
Register PriceOS v3 tools in Lyzr and attach them to the v3 agents.

Verified API shapes (2026-05-31):
  POST /v3/tools/  body {tool_set_name, openapi_schema, enhance_descriptions}
       -> {"tool_ids": [ {name, description, parameters, method, path}, ... ]}
       (Lyzr auto-prepends "openapi-" to tool_set_name; tool name becomes
        "openapi-<tool_set_name>-<operationId>")
  GET  /v3/agents/{id}   -> full agent object (has a 'tools' array)
  PUT  /v3/agents/{id}   -> attach by setting that 'tools' array, send api_key

Registers TWO tool sets:
  - priceos-pms      from  ../../../openapi-agent-tools-v1.json   (served at ngrok)
  - priceos-v3-svc   from  ../../schemas/openapi-contract.json    (localhost; non-functional until deployed)
Then attaches the right tool objects to each v3 agent per workflow-registry.json.

DRY RUN by default. Pass --live. Logs to ./attach-log.txt. Stdlib only.
"""
import argparse, json, sys, urllib.request, urllib.error
from pathlib import Path
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

HERE = Path(__file__).resolve().parent
LYZR_CONFIG = HERE.parent
MIGRATION = LYZR_CONFIG.parent
PRICEOS = MIGRATION.parent
ENV_PATH = PRICEOS / ".env"
WF = MIGRATION / "schemas" / "workflow-registry.json"
CONTRACT = MIGRATION / "schemas" / "openapi-contract.json"
PMS_SPEC = PRICEOS / "openapi-agent-tools-v1.json"
CREATED = HERE / "created-agent-ids.json"
TOOLMAP = HERE / "tool-id-map.json"
LOG = HERE / "attach-log.txt"
BASE = "https://agent-prod.studio.lyzr.ai"

_lf = open(LOG, "w", encoding="utf-8")
def log(*a):
    s = " ".join(str(x) for x in a); print(s); _lf.write(s+"\n"); _lf.flush()

def key():
    for l in ENV_PATH.read_text().splitlines():
        if l.startswith("LYZR_API_KEY="):
            return l.split("=",1)[1].strip().strip('"')
    sys.exit("no key")

def call(method, url, H, body=None, t=90):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=H)
    try:
        x = urllib.request.urlopen(r, timeout=t)
        raw = x.read().decode()
        try: return x.status, json.loads(raw)
        except: return x.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8","replace")
        try: return e.code, json.loads(raw)
        except: return e.code, raw
    except Exception as e:
        return 0, str(e)

def register(H, set_name, spec, live):
    if not live:
        ops = [o["operationId"] for p in spec.get("paths",{}).values()
               for o in p.values() if isinstance(o,dict) and "operationId" in o]
        log(f"  [dry] would register '{set_name}' with ops: {ops}")
        return [{"name": f"openapi-{set_name}-{op}", "_op": op} for op in ops]
    st, body = call("POST", f"{BASE}/v3/tools/", H,
                    {"tool_set_name": set_name, "openapi_schema": spec,
                     "enhance_descriptions": False})
    log(f"  [{st}] register '{set_name}'")
    tools = body.get("tool_ids", []) if isinstance(body, dict) else []
    if not tools:
        log(f"     unexpected resp: {json.dumps(body)[:300]}")
    else:
        log(f"     -> {[t.get('name') for t in tools]}")
    return tools

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--live", action="store_true")
    args = ap.parse_args()
    k = key(); H = {"Content-Type":"application/json","x-api-key":k}
    agent_tools = json.loads(WF.read_text())["agent_tools"]
    created = json.loads(CREATED.read_text())
    new_agents = {a:v["agent_id"] for a,v in created.items() if "agent_id" in v}

    log("=== Attach v3 tools -", "LIVE" if args.live else "DRY RUN", "===")
    log("\n--- Register tool sets ---")
    pms = register(H, "priceos-pms", json.loads(PMS_SPEC.read_text()), args.live)
    svc = register(H, "priceos-v3-svc", json.loads(CONTRACT.read_text()), args.live)

    # name -> tool object, keyed by trailing operationId
    catalog = {}
    for t in (pms + svc):
        nm = t.get("name","")
        op = nm.split("-")[-1] if nm else t.get("_op","")
        # robust: match against known op by suffix
        catalog[op] = t
    # also index by full required names via suffix match
    def find(toolname):
        if toolname in catalog: return catalog[toolname]
        for op, t in catalog.items():
            if t.get("name","").endswith("-"+toolname): return t
        return None
    TOOLMAP.write_text(json.dumps({k2:v.get("name") for k2,v in catalog.items()}, indent=2))
    log(f"  catalog ops: {sorted(catalog)}\n")

    log("--- Attach to each v3 agent ---")
    summary = {}
    for agent, aid in new_agents.items():
        want = agent_tools.get(agent, [])
        objs, missing = [], []
        for n in want:
            t = find(n)
            (objs.append(t) if t else missing.append(n))
        log(f"\n  [{agent}] {aid}")
        log(f"    want: {want}")
        log(f"    matched: {[o.get('name') for o in objs]}")
        if missing: log(f"    MISSING: {missing}")
        if not args.live:
            summary[agent] = {"matched": len(objs), "missing": missing}; continue
        st, ag = call("GET", f"{BASE}/v3/agents/{aid}", H)
        if st != 200 or not isinstance(ag, dict):
            log(f"    GET failed [{st}]"); summary[agent]={"err":st}; continue
        ag["tools"] = [o.get("name") for o in objs if o.get("name")]
        ag["api_key"] = k
        st2, resp = call("PUT", f"{BASE}/v3/agents/{aid}", H, ag)
        log(f"    PUT [{st2}] {json.dumps(resp)[:160]}")
        summary[agent] = {"put": st2, "attached": len(objs), "missing": missing}

    log("\n=== SUMMARY ===\n" + json.dumps(summary, indent=2))
    _lf.close()

if __name__ == "__main__":
    main()
