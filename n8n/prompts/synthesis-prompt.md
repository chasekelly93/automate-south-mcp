# Claude Prompt #2 — Synthesis and Note Generation

Used by the "Claude - Synthesize Note" node in `lead-enrichment-workflow.json`.
Model: `claude-sonnet-5` (this is the prompt that actually writes what the
pull-up staff read, worth spending the extra cost on quality).

This is the prompt from the original spec, essentially verbatim — only the
merge fields were added.

## User message template

```
You are preparing call notes for a sales team member about to call a
potential customer. Here is what we found about {{businessName}}
{{#if location}}in {{location}}{{/if}}: search result snippets, and full
scraped content from their website and other pages where available.

SEARCH RESULT SNIPPETS:
{{searchSnippets}}

SCRAPED PAGE CONTENT:
{{scrapedContent}}

{{#if noScrapedContent}}
(No pages were flagged as high-value enough to open. Work only from the
search snippets above, and say plainly that deeper research wasn't
available.)
{{/if}}

Synthesize this into a natural, readable call-prep note, 2 to 4 paragraphs,
plain prose, not a bulleted list. Include: current location, decision maker
name(s) if found, years in business if found, an honest assessment of
website quality (professional/outdated/nonexistent), any recent news or
updates, and any discrepancies between sources, stating which source you
lean toward trusting and why. If information isn't found, say so plainly
rather than guessing.
```

## Notes on the merge fields

- `searchSnippets` — the original SerpAPI titles/links/snippets, same list
  used in Prompt #1, so Claude always has the shallow signal even for pages
  that weren't opened.
- `scrapedContent` — for each flagged URL the scraper service successfully
  rendered: `### {{title}} ({{url}})\n{{text}}`. Pages that failed to scrape
  are omitted here but still show up in `searchSnippets`, so a failed scrape
  degrades gracefully instead of losing the source entirely.
- `noScrapedContent` is set when zero pages were flagged or all scrapes
  failed — this keeps Claude from inventing detail it doesn't have.

## Expected output

Plain prose, 2-4 paragraphs. No JSON, no markdown — this is pasted directly
into the GHL note body as-is.
