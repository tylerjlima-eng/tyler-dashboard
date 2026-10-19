// eBay Sell Inventory API integration point. Builds the exact request bodies; sending requires a backend
// holding Tyler's eBay Client ID/Secret + user refresh token (never in this public static site). See SETUP.md.
const EBAY = {
  // Point this at a deployed backend (e.g. Cloudflare Worker, see worker/ebay-worker.js). Empty = not connected.
  BACKEND_URL: "",
  MARKETPLACE: "EBAY_US",
  CATEGORY_CCG_SINGLES: "183454", // CCG Individual Cards (Pokémon/Yu-Gi-Oh). Sports singles: fetch via Taxonomy getCategorySuggestions.
  build(d) {
    const sku = d.sku || ("TL-" + Date.now().toString(36).toUpperCase());
    const graded = d.conditionId === "2750";
    const item = {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: graded ? "LIKE_NEW" : "USED_VERY_GOOD", // enum mapped to conditionId 2750 (graded) / 4000 (ungraded) for trading cards
      conditionDescriptors: graded
        ? [{ name: "27501", values: ["<grader value id for " + d.grader + ">"] }, { name: "27502", values: ["<grade value id for " + d.grade + ">"] }, ...(d.cert ? [{ name: "27503", additionalInfo: d.cert }] : [])]
        : [{ name: "40001", values: ["<card condition value id for " + d.raw + ">"] }],
      product: { title: d.title, description: d.description, aspects: d.aspects || {}, imageUrls: d.imageUrls || [] }
    };
    const offer = {
      sku, marketplaceId: this.MARKETPLACE, format: "FIXED_PRICE", availableQuantity: 1,
      categoryId: d.categoryId || this.CATEGORY_CCG_SINGLES, listingDescription: d.description,
      pricingSummary: { price: { value: String(d.price || ""), currency: "USD" } },
      listingPolicies: { fulfillmentPolicyId: "<FULFILLMENT_POLICY_ID>", paymentPolicyId: "<PAYMENT_POLICY_ID>", returnPolicyId: "<RETURN_POLICY_ID>" },
      merchantLocationKey: "<MERCHANT_LOCATION_KEY>"
    };
    return { note: "PLACEHOLDER ids in <angle brackets> are filled server-side; condition descriptor value IDs must be looked up via Metadata/Taxonomy API.",
      steps: [
        { call: "PUT https://api.ebay.com/sell/inventory/v1/inventory_item/" + sku, name: "createOrReplaceInventoryItem", body: item },
        { call: "POST https://api.ebay.com/sell/inventory/v1/offer", name: "createOffer", body: offer },
        { call: "POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish", name: "publishOffer", body: null }] };
  },
  async publish(d) {
    if (!this.BACKEND_URL) throw new Error("eBay not connected yet: needs API keys + backend (see Setup tab).");
    const r = await fetch(this.BACKEND_URL + "/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
    return r.json();
  }
};
