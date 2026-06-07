#!/usr/bin/env python3
"""
Create PriceOS v3 agents in Lyzr Studio via the Agent API.

Endpoint (per https://docs.lyzr.ai/agent-apis/agents/Create%20Agent):
    POST https://agent-prod.studio.lyzr.ai/v3/agents/
    headers: Content-Type: application/json, x-api-key: <LYZR_API_KEY>
    (this endpoint also requires api_key in the body)
    response: {"agent_id": "<id>"}

- Reads LYZR_API_KEY from ../../../.env (never printed).
- Reads system prompts + output schemas from ../prompts/*.md
- Reads model / temperature / tools from ../agent-configs.json
- Creates 8 agents; SKIPS maya + conversation_summary (kept as v2, additive only).
- Attaches NO tools at create time (service OpenAPI not deployed yet).
- Saves agent_ids to ./created-agent-ids.json. Does NOT run any agent.

DEFAULT IS DRY RUN. Pass --live to actually create. Uses only the stdlib.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import ssl
from pathlib import Path

ssl._create_default_https_context = ssl._create_unverified_context

HERE = Path(__file__).resolve().parent
LYZR_CONFIG = HERE.parent
AGENT_CONFIGS = LYZR_CONFIG / "agent-configs.json"
ENV_PATH = LYZR_CONFIG.parents[1] / ".env"
OUTPUT_IDS = HERE / "created-agent-ids.json"
CREATE_URL = "https://agent-prod.studio.lyzr.ai/v3/agents/"

# Lyzr account supports the Claude 3.x family (not claude-4 strings). Map our
# internal v3 names -> nearest supported Lyzr model. Verified via create+delete
# probe + https://docs.lyzr.ai/agent-lab/models on 2026-05-31.
MODEL_MAP = {
    "claude-haiku-4":       ("anthropic",  "claude-haiku-4-5",  "lyzr_anthropic"),
    "claude-sonnet-4.6":    ("anthropic",  "claude-sonnet-4-5", "lyzr_anthropic"),
    "perplexity-sonar-pro": ("Perplexity", "sonar-pro",                  "lyzr_perplexity"),
}
CREATE_KEYS = ["aria", "property_analyst", "booking_intelligence", "market_research",
               "priceguard", "anomaly_detector", "atlas", "event_intelligence"]
SKIP_KEYS = ["maya", "conversation_summary"]


def post_json(url, headers, body, timeout=60):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw
    except urllib.error.URLError as e:
        return 0, str(e)


def load_api_key():
    key = os.environ.get("LYZR_API_KEY", "").strip()
    if not key and ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("LYZR_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not key:
        sys.exit("LYZR_API_KEY not found in env or " + str(ENV_PATH))
    return key


def extract_block(md, header):
    idx = md.find(header)
    if idx == -1:
        return ""
    start = md.find("```", idx)
    if start == -1:
        return ""
    body_start = md.find("\n", start) + 1
    end = md.find("```", body_start)
    return md[body_start:end].strip() if end != -1 else ""


def load_agent_prompt(prompt_file):
    md = (LYZR_CONFIG / prompt_file).read_text(encoding="utf-8")
    return extract_block(md, "## SYSTEM PROMPT"), extract_block(md, "## OUTPUT SCHEMA")


def build_payload(cfg):
    system_prompt, output_schema = load_agent_prompt(cfg["prompt_file"])
    if not system_prompt:
        raise ValueError("No SYSTEM PROMPT block in " + cfg["prompt_file"])
    provider_id, model_id, credential_id = MODEL_MAP[cfg["model"]]
    instructions = system_prompt
    if output_schema:
        instructions += ("\n\n## REQUIRED OUTPUT FORMAT\nRespond ONLY with a single "
                         "JSON object matching this schema exactly. No prose outside "
                         "the JSON.\n\n```json\n" + output_schema + "\n```")
    payload = {
        "name": "June_" + cfg["display_name"],
        "description": cfg.get("notes", cfg["display_name"]),
        "agent_role": cfg["display_name"],
        "agent_goal": cfg.get("notes", ""),
        "agent_instructions": instructions,
        "features": [],
        "tools": [],
        "tool_usage_description": "Tools to attach post-deploy: " + ", ".join(cfg["tools"]),
        "provider_id": provider_id,
        "model": model_id,
        "llm_credential_id": credential_id,
        "temperature": cfg["temperature"],
        "top_p": 0.9,
    }
    if output_schema:
        try:
            payload["response_format"] = {"type": "json_schema",
                                          "json_schema": json.loads(output_schema)}
        except json.JSONDecodeError:
            pass
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    configs = json.loads(AGENT_CONFIGS.read_text(encoding="utf-8"))["agents"]
    keys = CREATE_KEYS
    if args.only:
        wanted = {k.strip() for k in args.only.split(",")}
        keys = [k for k in CREATE_KEYS if k in wanted]

    api_key = load_api_key()
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    print("=== Create PriceOS v3 agents - " + ("LIVE" if args.live else "DRY RUN") + " ===")
    print("Creating: " + ", ".join(keys))
    print("Skipping (v2 + additive audit): " + ", ".join(SKIP_KEYS) + "\n")

    results = {}
    for key in keys:
        cfg = configs[key]
        payload = build_payload(cfg)
        print("--- %s  (%s @ temp %s) ---" % (key, cfg["model"], cfg["temperature"]))
        print("    provider/model/cred: %s / %s / %s"
              % (payload["provider_id"], payload["model"], payload["llm_credential_id"]))
        print("    instructions: %d chars | tools-needed: %d"
              % (len(payload["agent_instructions"]), len(cfg["tools"])))
        if not args.live:
            (HERE / ("payload-" + key + ".json")).write_text(
                json.dumps(payload, indent=2), encoding="utf-8")
            print("    [dry run] -> payload-" + key + ".json\n")
            continue
        live_body = dict(payload, api_key=api_key)
        status, data = post_json(CREATE_URL, headers, live_body)
        if status < 200 or status >= 300:
            snippet = data if isinstance(data, str) else json.dumps(data)
            print("    ERROR %s: %s\n" % (status, snippet[:500]))
            results[key] = {"error": status, "body": snippet[:500]}
            continue
        agent_id = data.get("agent_id") or data.get("_id") or data.get("id") if isinstance(data, dict) else None
        print("    CREATED agent_id = %s\n" % agent_id)
        results[key] = {"agent_id": agent_id, "model": payload["model"]}

    if args.live:
        existing = {}
        if OUTPUT_IDS.exists():
            try:
                existing = json.loads(OUTPUT_IDS.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing = {}
        existing.update(results)
        OUTPUT_IDS.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        print("Saved agent ids -> %s (%d total)" % (OUTPUT_IDS, len(existing)))
    else:
        print("Dry run complete. Review payload-*.json, then re-run with --live.")


if __name__ == "__main__":
    main()
