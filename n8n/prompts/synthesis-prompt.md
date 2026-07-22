# Claude Prompt #2 — Synthesis and Note Generation

Used by the "Claude - Synthesize Note" node in `lead-enrichment-workflow.json`.
Model: `claude-sonnet-5` (this is the prompt that actually writes what the
pull-up staff read, worth spending the extra cost on quality).

This started as the original spec's prompt, essentially verbatim, but was
revised after the first real end-to-end test: the narrative-paragraph
format was accurate but too slow to scan for a rep dialing from the field.
It now leads with a quick-facts block (links, rating, decision maker) and
follows with 2-3 sentences instead of full paragraphs.

## User message template

```
You are preparing a quick, actionable call-prep brief for a sales rep
about to call a potential customer - often while they're out in the
field, so this needs to be scannable in about 15 seconds, not read like a
memo. Here is what we found about {{businessName}}
{{#if location}}in {{location}}{{/if}}: search result snippets, and full
scraped content from their website and other pages where available.
{{#if contactName}}
The lead form was submitted by: {{contactName}}
{{/if}}

SEARCH RESULT SNIPPETS:
{{searchSnippets}}

SCRAPED PAGE CONTENT:
{{scrapedContent}}

{{#if noScrapedContent}}
(No pages were flagged as high-value enough to open. Work only from the
search snippets above, and say plainly that deeper research wasn't
available.)
{{/if}}

Write the brief in exactly this structure:

**Quick facts:**
- Website: [the actual URL from the material above, only if you're
  confident it's their real official site - otherwise write "Not found"]
- Google Business Profile: [the actual URL from the material above if one
  appears, otherwise "Not found"]
- Google rating: [e.g. "4.6 stars (128 reviews)" if a rating/review count
  appears in the material above, otherwise "Not found"]
- Location: [city/state - flag in a few words if sources disagree]
- Decision maker: [name if found online; otherwise the lead form contact
  name if that's all you have]
- Years in business: [if found, otherwise "Not found"]

**What to know before you dial:** 2-3 short sentences (not paragraphs)
covering website quality, any recent news, and the single most important
discrepancy between sources if one exists - state plainly which source
you lean toward trusting and why. Skip anything not found rather than
padding with filler.

Be honest and specific. Never invent a URL, rating, or name that isn't
explicitly present in the search snippets or scraped content above -
write "Not found" instead of guessing.
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
- `contactName` — first + last name of whoever submitted the GHL lead
  form, when the GHL workflow's webhook body includes `firstName`/
  `lastName`. Optional; the line is omitted from the prompt entirely if
  absent.

## Expected output

A short markdown-lite brief: a "Quick facts" bullet block (website, GBP,
Google rating, location, decision maker, years in business — each either
filled in or explicitly "Not found") followed by 2-3 sentences of "what to
know before you dial." This is pasted directly into the GHL note body
as-is, so GHL's note field needs to render basic markdown (bold, bullets)
reasonably for this to look right — check how it displays after a real
test.
