# Evaluation

How the check was tested before it went live on galini-studio.de (9–11 October 2026). The 13 test sites are anonymised: nine real small businesses from the region (letters A–I), plus four of the author's own sites (her studio site, a design study for a roofer, a software product page and a demo for a car workshop).

## 1. Rules only, checked by hand

The fixed rules answer five of the customer questions themselves: prices, opening or contact hours, reaching someone from a phone, sending an inquiry, address. That is 65 traffic lights on 13 sites.

Every light was checked by hand against two things: the text a real browser shows at phone width, and the HTML (tappable `tel:` links, forms, WhatsApp links).

**62 of 65 were right.** The three misses:

| Site | Miss | Fix |
|---|---|---|
| Studio site | Contact hours marked "not found", although the page said "mostly in the morning between seven and nine or after 3 pm". No weekday, so the rule did not match. | Free-text times near words like "call" or "reach" now count as a hint (yellow) with the quote. |
| Software product page | A worked example ("transfers €1,250.00") counted as a price. | Amounts right after "IBAN" or "transfer" are not prices any more. |
| Roofer study | Prices found, but they were the studio's prices for the study, not roofing prices. | Left to the AI, which tells them apart (see round 2). |

Bugs found on the way: "so" and "die" were read as weekdays (Sunday, Tuesday), so legal notices became opening hours. A 1.06 MB WordPress page was cut at 800 KB and only CSS was read. Frames came in the wrong order. A host dropped connections over IPv6 but never over IPv4. "Only reachable with www" was a false alarm twice, so it is now only reported if DNS or both protocols really fail.

## 2. Two rounds with the AI

The AI (Claude Sonnet 5.5, structured output, effort `medium`) reads the collected text and answers seven customer questions. **Every answer must quote the site verbatim.** The server checks each quote against the material. An answer without a verified quote does not count; where the rules are certain (form, booking link, tappable number), the rules win.

| | Round 1 | Round 2 |
|---|---|---|
| Sites with AI | 9 of 13 (three failed while reading, one timed out) | 13 of 13 |
| Tokens in / out | 64,317 / 11,037 | 100,303 / 15,963 |
| Per site | about 7,100 / 1,200 | about 7,700 / 1,200 |
| Invented quotes that got through | 0 | 0 |

All 54 answers of round 1 were read by hand and compared with the checked rule results. One quote was not verbatim; the server rejected it and the rule applied.

What the AI finds that rules miss:

- leftover template text with a fake phone number (`+01 123 444 555`, `info@company.com`), which an AI assistant might pass on as real;
- contradicting opening hours in header and footer;
- vague service descriptions ("a broad range of services") that leave a customer guessing;
- whether there is at least a way to get a price.

What was changed after round 1:

- Advertising phrases ("fair prices", "affordable") count as "no price found", not as a partial answer.
- Tips must not contain made-up numbers (one tip had invented an example price).
- A sub-page that failed to load is fetched once more. If it still fails, the report says "could not read the contact page" instead of "no form".

After round 2, two small issues in the material were fixed: short labels like "Monday to Thursday" on their own line are now kept with the times below them, and quotes across headings are matched without our internal `##` markers.

## 3. Customer path, accessibility, design

The live page shows the result as nine stations of a customer's path (Google, phone, services, price, hours, calling, address, trust, inquiry). Each station has a shape and a word, not a traffic-light colour: solid disc "gets through", half disc "only with effort", open ring "gets stuck", dashed ring "open".

- Accessibility was measured with axe-core, a keyboard pass, three widths and reduced motion (WCAG 2.1 AA). Quotes from a German site on the Polish page carry `lang="de"`.
- A separate review agent checked the build against a written design brief. It asked for eight fixes, for example the order of the stations and missing quotes, and approved the second round.

## 4. Live

Since 10 October 2026 the check runs at <https://galini-studio.de/ki-check/> (Polish: `/pl/sprawdz-strone/`) as a Netlify Function: 52 s budget, 4 checks per visitor in 10 minutes, a daily AI limit, results cached for 24 hours, a log without IP addresses kept for 90 days. It follows `robots.txt` (see README).
