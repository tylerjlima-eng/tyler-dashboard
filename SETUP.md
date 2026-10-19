# Setup & status

### What's live
- **Markets**: daily price snapshots from PriceCharting / SportsCardsPro (values based on completed eBay sales) + YGOPRODeck (TCGplayer prices for Yu-Gi-Oh). A GitHub Action refreshes `data/prices.json` every morning (~7:17 AM ET).
- **1d / 7d** changes fill in after the job has run for 1 / 7 days. **30d** uses PriceCharting's monthly history until 30 days of our own snapshots exist.
- **Spike rule**: a move of at least 10% (1d), 15% (7d) or 20% (30d) gets flagged.
- **Add cards**: paste a pricecharting.com or sportscardspro.com product URL on the Markets tab, then add the line to `data/watchlist.json` on GitHub.

### eBay publishing (not connected yet)
The List tab already builds the exact Sell Inventory API calls. To publish for real from **ya_mothers_garage**, you'll need:
1. An **eBay Developers Program** account and a **Production keyset**: App ID (Client ID), Cert ID (Client Secret), Dev ID. https://developer.ebay.com
2. Before the first production call, either subscribe to **Marketplace Account Deletion** notifications or opt out of them (https://developer.ebay.com/marketplace-account-deletion). The worker has a stub endpoint for this.
3. A **RuName** (redirect URL name) on the keyset, then a one-time sign-in with ya_mothers_garage. That gives a **User refresh token** (about 18 months) with scopes `sell.inventory`, `sell.account` and `sell.fulfillment`. An Application token can't list items.
4. **Business policies**: opt in to `SELLING_POLICY_MANAGEMENT`, then create fulfillment, payment and return policies. Publishing needs all three policy IDs.
5. An **inventory location** (`createInventoryLocation`). Its `merchantLocationKey` is required for publishOffer.
6. The flow is `createOrReplaceInventoryItem`, then `createOffer`, then `publishOffer`. Trading-card condition IDs: **2750 = graded** (descriptors: grader, grade, cert #), **4000 = ungraded** (card-condition descriptor). The CCG singles category is 183454. Get sports categories and aspects from the Taxonomy API.
7. A small **backend** that keeps the secrets. This site is public and static, so secrets must never go in it. `worker/ebay-worker.js` is a ready Cloudflare Worker skeleton (free plan: Workers + Cron + D1). Store the keys with `wrangler secret put`, then set `EBAY.BACKEND_URL` in `ebay.js`.
- Note: listings created through the Inventory API should then be edited through the Inventory API, not the old eBay tools.
- **Comps**: eBay's sold-items API (Marketplace Insights) is restricted, so comps come from PriceCharting/SportsCardsPro, YGOPRODeck and any sold prices you paste in. The eBay Browse API (active listings) can be added once keys exist. The eBay sold-search page blocks automated fetches, so the List tab shows it as a link you tap.

### Calendar
- Q4 2026 Pokémon / Yu-Gi-Oh releases, tournaments, sports-card releases and card shows are pre-loaded from public sources, and every event links to its source. Dates marked "expected", "preliminary" or "unconfirmed" can change.
- Your tasks are stored on this phone/browser only (not synced). Use **Export .ics** to add them to Google or Apple Calendar.
- Google Calendar sync can be connected later. That needs a Google OAuth client and the same kind of backend.

### Privacy
- The repo is public, and it contains no keys or tokens. Drafts and tasks stay in your browser's local storage.
