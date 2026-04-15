# Lyzr Default Config Blocks (v1)

Copy these into the **Add Custom Tool** modal for each toolset.

## 1) Dashboard Tool (`priceos_dashboard_tools_v1`)

### Default Headers (JSON)
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_SHARED_DEV_TOKEN",
  "x-tool-org-id": "YOUR_ORG_OBJECT_ID"
}
```

### Default Query Parameters (JSON)
```json
{}
```

### Default Body Parameters (JSON)
```json
{}
```

### Endpoint Defaults (JSON)
```json
{}
```

## 2) Property Tool (`priceos_property_tools_v1`)

### Default Headers (JSON)
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_SHARED_DEV_TOKEN",
  "x-tool-org-id": "YOUR_ORG_OBJECT_ID"
}
```

### Default Query Parameters (JSON)
```json
{}
```

### Default Body Parameters (JSON)
```json
{}
```

### Endpoint Defaults (JSON)
```json
{}
```

## 3) Guest Tool (`priceos_guest_tools_v1`)

### Default Headers (JSON)
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_SHARED_DEV_TOKEN",
  "x-tool-org-id": "YOUR_ORG_OBJECT_ID"
}
```

### Default Query Parameters (JSON)
```json
{}
```

### Default Body Parameters (JSON)
```json
{}
```

### Endpoint Defaults (JSON)
```json
{}
```

## Optional Endpoint Defaults (if you want auto date window)

Use this only if you want all tool calls to automatically include a fixed date range unless the agent overrides it:

```json
{
  "get_portfolio_overview": {
    "query": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30"
    }
  },
  "get_portfolio_revenue_snapshot": {
    "query": {
      "dateFrom": "2026-04-01",
      "dateTo": "2026-04-30",
      "groupBy": "day"
    }
  }
}
```

Keep defaults empty for production to avoid stale date windows.
