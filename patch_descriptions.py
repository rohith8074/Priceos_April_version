import json

def patch_file(filepath, fallback_dict=None):
    with open(filepath, "r") as f:
        data = json.load(f)
    
    modified = False
    for path, path_item in data.get("paths", {}).items():
        for method, operation in path_item.items():
            op_id = operation.get("operationId")
            
            if fallback_dict and op_id in fallback_dict:
                operation["description"] = fallback_dict[op_id]
                modified = True
            elif "summary" in operation and "description" not in operation:
                operation["description"] = operation["summary"]
                modified = True
                
    if modified:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Patched {filepath} with descriptions.")

DESCRIPTIONS = {
    "get_portfolio_overview": "Cross-property portfolio summary for an org.",
    "get_agent_system_status": "Get the system status of the Lyzr agent backend.",
    "get_portfolio_revenue_snapshot": "Get a revenue snapshot for the portfolio over a time window.",
    "get_property_profile": "Get a property's identity and pricing limits.",
    "get_property_calendar_metrics": "Occupancy, booked/blocked/bookable nights, average nightly rate and total revenue.",
    "get_property_reservations": "List a property's reservations in a window.",
    "get_property_market_events": "Get market events for a property.",
    "get_property_benchmark": "Competitor rate percentiles and positioning for a property.",
    "list_guest_conversations": "List guest conversations for a listing.",
    "get_guest_summary": "Get a summary of guest sentiment for a listing."
}

patch_file("openapi-agent-tools-v1.json", DESCRIPTIONS)
patch_file("priceos-v3-migration/schemas/openapi-contract.json", None)
