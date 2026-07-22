# Lead Enrichment System — Setup Guide

Automated call-prep research for GHL leads: a Facebook lead form submission
triggers a search + scrape + Claude synthesis pipeline that posts a
narrative note to the contact record before anyone calls them.

## Architecture

```
GHL (Facebook lead form)
  -> GHL Workflow: If/Else toggle + Add Tag + Custom Webhook action
     -> n8n: Lead Enrichment workflow (n8n/lead-enrichment-workflow.json)
         -> SerpAPI: google engine (top 10 organic results)
         -> SerpAPI: google_local engine (structured business listing -
            rating, review count, address, website, if Google has one)
         -> Claude Haiku (pick worthwhile links)
         -> scraper-service (this repo, Playwright) - only flagged links
         -> Claude Sonnet (synthesize call-prep note)
         -> GHL API (POST note to contact)
```

Two things get deployed:

1. **`scraper-service/`** — a small Express + Playwright service. Given a
   URL, it renders the page and returns clean text (nav/footer/ads
   stripped via Readability). Deploy it the same way you deployed the
   existing `ghl-mcp` server in this repo (DigitalOcean App Platform or a
   droplet with the included Dockerfile).
2. **`n8n/lead-enrichment-workflow.json`** — an importable n8n workflow.
   Import it into your existing n8n instance; nothing else in this repo
   talks to n8n directly.

Everything else (the GHL workflow, the tag, the API keys) is configuration
you set up in the GHL/n8n UIs, walked through below.

---

## 1. Accounts and keys you need

| What | Why | Where |
|---|---|---|
| SerpAPI account | Top-10 Google results per lead | serpapi.com — sign up, grab API key from dashboard |
| Anthropic API key | You already have this | console.anthropic.com |
| GHL API credential | Posting the note back to the contact | See note below — confirm agency/location key vs. Private Integration token |
| DigitalOcean | Hosting `scraper-service` | You already have this |

**GHL auth note:** this repo's existing `ghl-mcp` server authenticates with
a static `Authorization: Bearer <key>` + `Version: 2021-07-28` header
against `services.leadconnectorhq.com`, using an agency or location API
key. The workflow below assumes that same pattern (env var
`GHL_LOCATION_API_KEY`). If you've since moved to a GHL **Private
Integration token** for this location (GHL has been deprecating the old
agency API key), use that token in the same env var — the header shape is
identical, just swap the key.

---

## 2. Deploy the scraper service

```bash
cd scraper-service
cp .env.example .env
# edit .env: set SCRAPER_SECRET to a long random value
#   generate one with: openssl rand -hex 32
```

Deploy `scraper-service/` to DigitalOcean using the included `Dockerfile`
(it's based on `mcr.microsoft.com/playwright`, which bundles Chromium so
there's no extra browser-install step). Whatever pattern you used to
deploy the `ghl-mcp` server — App Platform pointed at this repo with a
build context of `scraper-service/`, or a standalone droplet — works the
same way here.

Set these environment variables on the deployed app:

- `SCRAPER_SECRET` — the same random value from your local `.env`
- `PORT` — usually left to DO's default (8080)

Once deployed, confirm it's alive:

```bash
curl https://<your-scraper-service-url>/health
# {"status":"ok"}
```

Keep the service's base URL handy — you'll set it as `SCRAPER_SERVICE_URL`
in n8n next.

---

## 3. Import the n8n workflow

1. In n8n: **Workflows -> Import from File** -> select
   `n8n/lead-enrichment-workflow.json`.
2. The workflow imports **inactive**. Leave it that way until you've
   tested it (step 5).
3. Set these environment variables on your n8n instance (not inside the
   workflow — the workflow reads them via `$env` so you never have to
   paste secrets into the workflow JSON itself):

   | Variable | Value |
   |---|---|
   | `SERPAPI_KEY` | your SerpAPI API key |
   | `ANTHROPIC_API_KEY` | your Claude API key |
   | `SCRAPER_SERVICE_URL` | base URL of the service you deployed in step 2, no trailing slash |
   | `SCRAPER_SERVICE_SECRET` | same value as `SCRAPER_SECRET` on the scraper service |
   | `GHL_LOCATION_API_KEY` | GHL location API key or Private Integration token |

   How you set env vars depends on how n8n is deployed on your droplet —
   typically an entry in the `docker-compose.yml` `environment:` block or
   an `.env` file n8n's container reads, then `docker compose up -d` (or
   restart the n8n service) to pick them up.

4. After import, open the **Lead Enrichment Trigger** webhook node and
   copy its **Production URL** (looks like
   `https://your-n8n-domain/webhook/lead-enrichment`). You'll paste this
   into the GHL workflow next.

---

## 4. Configure the GHL side

You need two things in GHL: a **tag** (for record-keeping — who got
researched), and a **workflow** with a branch that decides who actually
gets enrichment and fires a Custom Webhook with a clean, minimal body.

**Important:** the on/off toggle lives entirely in GHL's own workflow
branching, not in a field n8n checks. GHL's `{{contact.tags}}` merge tag
does not reliably serialize into a webhook JSON body — in testing it came
through as the literal string `"null"` even on a tagged contact. So don't
rely on passing tags through and having n8n filter on them. Instead, gate
it upstream: only contacts that pass your If/Else condition ever reach the
"Add Tag" + Webhook steps, so by the time the webhook fires, enrichment is
already the correct decision.

### 4a. Create the record-keeping tag

Create a tag called `enrich-lead` (Settings -> Tags, or inline the first
time you use it in a workflow). This gets applied to every contact that
goes through the enrichment path, purely so you can filter/search GHL
contacts later to see who was researched — it is not read by n8n.

### 4b. Build the GHL workflow

1. **Trigger:** Contact Created (or Form Submitted, scoped to the specific
   Facebook lead form) — whichever you use to catch new Facebook leads.
2. **If/Else condition — this is the actual toggle:** only the branch that
   matches proceeds to enrichment — e.g. "if Contact Source = [specific ad
   campaign]" or "if Pipeline = [specific pipeline]". Leads that don't
   match this condition skip straight past steps 3-4 below — no tag, no
   webhook, no cost.
3. **Add Tag action:** add `enrich-lead` to the contact (record-keeping
   only, see above).
4. **Custom Webhook action:** POST to the n8n Production URL from step
   3.4, with a raw JSON body (not "standard data") — this is the **Custom
   Webhook** action type, not the plain **Webhook** action, since only
   Custom Webhook lets you fully replace the payload instead of appending
   to GHL's full contact/form dump:

   ```json
   {
     "contactId": "{{contact.id}}",
     "locationId": "{{location.id}}",
     "businessName": "{{contact.company_name}}",
     "firstName": "{{contact.first_name}}",
     "lastName": "{{contact.last_name}}",
     "city": "{{contact.city}}",
     "state": "{{contact.state}}"
   }
   ```

   `firstName`/`lastName` are new — the workflow uses them to mention who
   submitted the lead form in the call-prep note (useful context against
   any decision-maker name it finds online). `tags` was dropped from the
   body entirely, for the reason above.

   **On `businessName`:** Facebook lead forms for auto body shops usually
   don't have a dedicated "business name" question by default. If yours
   doesn't either, either (a) add a "Company Name" question to the Facebook
   form so it lands in GHL's standard company field, or (b) create a
   custom field for it and reference that field instead of
   `contact.company_name` above. Without a business name, the workflow
   has nothing to search for and intentionally skips enrichment rather
   than guessing — you'll just get a lead with no note, same as today.

That's the whole toggle: the If/Else branch in step 2 decides who gets
researched; the webhook only ever fires for contacts that already passed
that decision.

---

## 5. Test it end to end

1. In n8n, activate the workflow (toggle **Active** on).
2. In GHL, run a test contact through the full workflow (trigger ->
   If/Else -> Add Tag -> Custom Webhook), with a real business name/city
   so there's something to research.
3. Watch the n8n **Executions** tab — you should see a run complete in
   roughly 20-40 seconds.
4. Check the contact's Notes in GHL for the call-prep paragraph.
5. Try a contact that **doesn't match** the If/Else condition — confirm it
   never reaches the webhook at all (nothing shows up in n8n's Executions
   for it), so you're not burning search/Claude cost on leads you didn't
   opt in.

---

## 6. Cost per lead (rough)

| Step | Cost |
|---|---|
| SerpAPI search (google engine) | ~$0.01-0.015 |
| SerpAPI local listing (google_local engine) | ~$0.01-0.015 |
| Claude Haiku (link filter) | ~$0.001-0.003 |
| Scraping (self-hosted compute, not per-call billed) | ~$0 marginal |
| Claude Sonnet (synthesis) | ~$0.01-0.03 depending on scraped content volume |
| **Total** | **~$0.03-0.06/lead**, comfortably under the $0.10 target |

---

## 7. Error handling & logging (already built in)

- **SerpAPI / Claude / GHL note post** retry automatically on transient
  failures (2-3 tries with backoff).
- **A single failed scrape** doesn't kill the run — that page is just
  dropped from the note's source material, and the note says so if *no*
  pages could be opened at all.
- **If Claude's synthesis call fails outright** after retries, the
  workflow still posts a note — a plain fallback message saying automated
  enrichment failed and manual research is needed, so pull-up staff are
  never left silently uninformed.
- **If the final GHL note post fails** after 3 retries, the execution
  shows as failed in n8n's Executions tab — that's your log. Check there
  first if a lead seems to be missing its note.
- Optional next step, not required to launch: point this workflow's
  **Settings -> Error Workflow** at a small notification workflow (Slack/
  email) if you want a push alert instead of having to check the
  Executions tab.

---

## 8. Updating things later

- **Scraping logic / text extraction:** edit `scraper-service/index.js`,
  redeploy to DigitalOcean. No n8n changes needed.
- **Search query, filtering logic, prompts, note formatting:** edit
  `n8n/lead-enrichment-workflow.json` (or edit live in the n8n UI and
  re-export back into this repo to keep them in sync), re-import/update
  the workflow in n8n.
- **Prompt wording:** the prompts are inlined in the "Build Claude Filter
  Request" and "Build Claude Synthesis Request" Code nodes. Reference
  copies with commentary live in `n8n/prompts/` for readability — edit
  both in tandem so they don't drift.
- **Which leads get enriched:** entirely controlled by the If/Else
  condition in the GHL workflow — no code or redeploy needed to turn it on
  or off for a shop/campaign.
