# Claude Prompt #2 — Synthesis and Note Generation

Used by the "Claude - Synthesize Note" node in `lead-enrichment-workflow.json`.
Model: `claude-sonnet-5` (this is the prompt that actually writes what the
pull-up staff read, worth spending the extra cost on quality).

This started as the original spec's prompt, essentially verbatim, but went
through two rounds of revision after real end-to-end tests:

1. The narrative-paragraph format was accurate but too slow to scan for a
   rep dialing from the field — switched to a quick-facts block first,
   then a short "Notes" line.
2. A test on a real shop caught a more serious problem: the synthesis
   step confidently blended facts from what looked like a *different,
   similarly-named business* (a "1948, no website" shop vs. a "1970,
   gregsautobody.com" shop) into one story instead of questioning whether
   they were the same place. The prompt now anchors on the lead's stated
   location and explicitly asks Claude to consider "two different
   businesses" as a hypothesis when facts diverge sharply, rather than
   reconciling them into one confident narrative.

## User message template

```
You are preparing a quick, actionable call-prep brief for a sales rep
about to call a potential customer - often while they're out in the
field, so this needs to be scannable in about 15 seconds, not read like a
memo. The lead's business is {{businessName}}
{{#if location}}, submitted with a stated location of {{location}}{{/if}}.
Here is what we found: search result snippets, and full scraped content
from their website and other pages where available.
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

Write the brief in exactly this structure, facts first, nuance last and
brief:

**Quick facts:**
- Business: [name as it appears in the sources - flag in brackets if you
  suspect the sources describe more than one distinct business sharing a
  similar name]
- Address: [whichever address best matches the lead's stated location
  above, if given - otherwise the most-repeated address across sources]
- Google rating: [e.g. "4.4 stars (165 reviews)" if present in the
  material above, otherwise "Not found"]
- Website: [the actual URL from the material above, only if you're
  confident it's their real official site, otherwise "Not found"]
- Google Business Profile: [the actual URL from the material above if one
  appears, otherwise "Not found"]
- Established: [year if found, otherwise "Not found"]
- Decision maker: [name if found online; otherwise the lead form contact
  name if that's all you have]

**Notes:** One or two short sentences MAX - only the single most
important thing the rep needs before dialing (a real address conflict, or
the possibility the sources describe two different similarly-named
businesses). Skip minor/rounding-level disagreements that don't change
what the rep should do (e.g. "48 years" vs. "over 55 years" isn't worth a
sentence on its own). If nothing needs flagging, write "Nothing else to
flag."

Be honest and specific. Never invent a URL, rating, address, or name that
isn't explicitly present in the search snippets or scraped content above -
write "Not found" instead of guessing. If founding dates or addresses
diverge sharply (decades apart, or different cities/regions), consider
whether the sources might describe two different businesses with a
similar name rather than one business with fuzzy facts, and say so
plainly in the Notes line instead of blending them into one confident
story.
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

A short markdown-lite brief: a "Quick facts" bullet block (business name,
address, Google rating, website, GBP, established year, decision maker —
each either filled in or explicitly "Not found") followed by a 1-2
sentence "Notes" line, only when something actually needs flagging. This
is pasted directly into the GHL note body as-is, so GHL's note field needs
to render basic markdown (bold, bullets) reasonably for this to look right
— check how it displays after a real test.
