# How to use
- **Install:** iPhone: Share → **Add to Home Screen**. Android: ⋮ → **Install app**.
- **Markets:** pick a category tab, search, sort, star ★ favorites, and tap any card for its price chart and all grades.
- **Inventory:** tap **Scan card**, take a photo, confirm the match, then enter grade, qty and price paid.
- **List:** pick a card → **Generate listing** → Copy into the eBay app.
- **Schedule:** releases, tournaments and card shows. Add tasks, then **Export .ics** to your calendar.

# Inventory & scanning
- Inventory lives **in this browser on this device only** (IndexedDB). Use **Export CSV** to back it up or move it to another device. Photos stay on the device.
- Cards that match a tracked card get the daily PriceCharting value for their grade. Other cards are priced live from YGOPRODeck (lowest ask) or TCGdex (TCGplayer market, or Cardmarket € if that's all there is), refreshed when you open the app, at most every 12 hours.
- **Track daily** on a card opens a ready-to-paste line for `data/watchlist.json`.
- Scanning uses on-device text recognition (Tesseract.js, downloaded on first use, about 10 MB). It reads card names, set codes like **LOB-001**, and numbers like **4/102**. Glare, holo foil, slabs and small print reduce accuracy, so always confirm the match. If the scan misses, type the name in the search box.

# Prices & signals
- Prices come from PriceCharting / SportsCardsPro guide values (built from eBay sold listings) and refresh every morning around 7:15 AM ET. Card images come from the same pages, with YGOPRODeck / TCGdex as backup.
- **Signals:** WATCH at +25%, SPIKE at +50%, DIP at −25%, DROP at −40%, measured with a 3-day median against a baseline. The baseline is the median of our snapshots 8–37 days old, or PriceCharting's prior month until we have enough history. A move needs at least $5 or 10% of the baseline. Cards under $3 are skipped, and one-day jumps need the next day to confirm. Minimum-sales and outlier rules wait for a sales feed (Terapeak export or the paid PriceCharting API).
- **Data quirks:** YGOPRODeck prices are lowest *asking* prices and don't separate editions. pokemontcg.io is erroring or stale. TCGdex has some wrong mappings (we flag them "suspect"). eBay sold-search pages block automated fetches.

# eBay publishing (not connected)
1. eBay Developers Program account → **Production keyset** (App ID, Cert ID, Dev ID).
2. Handle Marketplace Account Deletion notifications: subscribe, or opt out (https://developer.ebay.com/marketplace-account-deletion).
3. RuName, then a one-time sign-in as ya_mothers_garage. That gives a user refresh token with `sell.inventory`, `sell.account` and `sell.fulfillment`.
4. Business policies (fulfillment, payment, return) and an inventory location (`merchantLocationKey`).
5. Flow: `createOrReplaceInventoryItem` → `createOffer` → `publishOffer`. Condition **2750** = graded, **4000** = raw. CCG singles category 183454.
6. Keys go in a small backend (`worker/ebay-worker.js`, Cloudflare Workers free plan), never in this public site. Then set `EBAY.BACKEND_URL` in `ebay.js`.

# Calendar & privacy
- Events are loaded from public sources, and each one links to its source. Tasks are saved on this device only. Google Calendar sync isn't connected yet; import the .ics file instead.
- The repo is public and holds no keys. Drafts, tasks, favorites and inventory stay in your browser.
