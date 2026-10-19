# How to use

### Put it on your home screen
- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap ⋮, then **Install app** (or **Add to Home screen**).

### Daily routine
1. **Markets**: tap a category chip, switch the Grade (Ungraded / PSA 10) and Window (1d / 7d / 30d). Top movers are sorted by biggest move. **Spike / drop signals** list cards that are up 25% or more (WATCH) or 50% or more (ALERT), or down 25% or more (DROP WATCH) or 40% or more (DROP ALERT). Before you list or buy, check sold comps in eBay Terapeak. Tap any card to open its price page.
2. **List**: pick a watchlist card (or type one in), set graded or raw, check the comps and suggested price, tap **Generate**, adjust the text, then **Copy** and paste it into the eBay app. **Save draft** keeps it on this phone.
3. **Schedule**: tap a day to see its events, and use the chips to hide categories. Add your own tasks with **Add task**. **Export .ics** puts them into Google or Apple Calendar so you get real phone alerts.
- Prices refresh automatically every morning around 7:15 AM ET. Pull down or reload to get the latest.

# Setup & status

### What's live
- **Markets**: daily price snapshots from PriceCharting / SportsCardsPro (values based on completed eBay sales) + YGOPRODeck (TCGplayer prices for Yu-Gi-Oh). A GitHub Action refreshes `data/prices.json` every morning (~7:17 AM ET).
- **1d / 7d** changes fill in after the job has run for 1 / 7 days. **30d** uses PriceCharting's monthly history until 30 days of our own snapshots exist.
- **Spike rule** (from the price research): a 3-day median is compared against a baseline. The baseline is the median of our snapshots 8–37 days old, or PriceCharting's prior-month value at first. WATCH at +25%, ALERT at +50%, DROP WATCH at −25%, DROP ALERT at −40%. The move must also be at least max($5, 10% of the baseline). Cards with a baseline under $3 are skipped, and a one-day jump needs the next day's price to confirm it. The minimum-sales and outlier rules need individual sale prices; free PriceCharting pages only give smoothed guide values, so those rules start working once a sales source is added (Terapeak export, or the paid PriceCharting API).
- **Watchlist**: 110 cards. Our own picks are merged with the price bot's 75 verified seed cards: Pokémon 20, Yu-Gi-Oh 25, NBA 21, NFL 20, MLB 24. Prices come from PriceCharting / SportsCardsPro. TCGdex (Cardmarket, in EUR) is the Pokémon fallback if PriceCharting fails; it's flagged "suspect" when its trend and 30-day average disagree by more than 10×.
- **Data quirks**: YGOPRODeck prices are lowest *asking* prices, so we use that printing's set-code price, looked up by passcode + set code (a name lookup can return an alt-art passcode); a price of "0" means missing. pokemontcg.io is erroring or stale (its Cardmarket data was about 3.5 months old). TCGdex has some wrong price mappings. eBay sold-search pages return 403 to automated fetches.
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
