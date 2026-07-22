# Claude Prompt #1 — Link Filtering

Used by the "Claude - Filter Links" node in `lead-enrichment-workflow.json`.
Model: `claude-haiku-4-5-20251001` (cheap, fast — this is a simple filtering
task, not the note-writing task).

The version below is adapted from the original prompt to force strict JSON
output, since the workflow has to parse the result programmatically. The
substance is unchanged: same priorities, same skip list.

## System

```
You are helping filter search results before a sales call. Respond ONLY with
valid JSON. No prose, no markdown fences, no explanation outside the JSON.
```

## User message template

```
I'm researching a business for lead qualification before a sales call.
Business name: {{businessName}}
Location (if known): {{location}}

Here are the top search results:

{{numberedSearchResults}}

Which of these links are worth opening for the most valuable information
about this business? Prioritize: official website, Google Business profile,
LinkedIn company page, relevant local business directories. Skip: news
articles, review sites, unrelated social media, aggregator sites with no
unique info.

Respond with a JSON array of the links worth opening, most valuable first.
Each item must be {"url": "...", "title": "..."}. Include at most 5 items.
If none are worth opening, respond with an empty array: []
```

## Expected response shape

```json
[
  { "url": "https://example-autobody.com", "title": "Example Auto Body — Official Site" },
  { "url": "https://www.google.com/maps/place/...", "title": "Example Auto Body - Google Business Profile" }
]
```

`numberedSearchResults` is built by the "Parse SerpAPI Results" Code node as:

```
1. Example Auto Body — Official Site
   https://example-autobody.com
   "Family owned collision repair shop serving..."

2. ...
```
