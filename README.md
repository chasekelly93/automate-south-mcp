# automate-south-mcp

Two components:

- **`index.js` / `tools-extended.js`** — the GHL (GoHighLevel) MCP server.
- **`scraper-service/`** + **`n8n/`** — the lead enrichment system: a
  Playwright-based scraping microservice and an importable n8n workflow
  that research a lead's business online and post a call-prep note to
  their GHL contact record before a sales call. See
  [`docs/LEAD_ENRICHMENT_SETUP.md`](docs/LEAD_ENRICHMENT_SETUP.md) for the
  full setup walkthrough.
