// NOT DEPLOYED. Skeleton Cloudflare Worker that would publish listings for ya_mothers_garage.
// Secrets (set with `wrangler secret put`, never committed): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN,
// EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID, EBAY_MERCHANT_LOCATION_KEY, ALLOWED_ORIGIN, PUBLISH_PIN
const API = "https://api.ebay.com";
const SCOPES = ["sell.inventory", "sell.account", "sell.fulfillment"].map(s => "https://api.ebay.com/oauth/api_scope/" + s).join(" ");
async function userToken(env) { // refresh token -> 2h user access token
  const r = await fetch(API + "/identity/v1/oauth2/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + btoa(env.EBAY_CLIENT_ID + ":" + env.EBAY_CLIENT_SECRET) },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.EBAY_REFRESH_TOKEN, scope: SCOPES }) });
  return (await r.json()).access_token;
}
export default {
  async fetch(req, env) {
    const cors = { "access-control-allow-origin": env.ALLOWED_ORIGIN, "access-control-allow-headers": "content-type,x-pin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname === "/ebay/account-deletion") return new Response("TODO: implement eBay Marketplace Account Deletion challenge/notification", { status: 501 });
    if (url.pathname !== "/publish" || req.headers.get("x-pin") !== env.PUBLISH_PIN) return new Response("forbidden", { status: 403, headers: cors });
    const { steps } = await req.json(); // body produced by EBAY.build() in ebay.js
    const tok = await userToken(env), H = { authorization: "Bearer " + tok, "content-type": "application/json", "content-language": "en-US" };
    const fill = o => JSON.parse(JSON.stringify(o).replace("<FULFILLMENT_POLICY_ID>", env.EBAY_FULFILLMENT_POLICY_ID).replace("<PAYMENT_POLICY_ID>", env.EBAY_PAYMENT_POLICY_ID)
      .replace("<RETURN_POLICY_ID>", env.EBAY_RETURN_POLICY_ID).replace("<MERCHANT_LOCATION_KEY>", env.EBAY_MERCHANT_LOCATION_KEY));
    const [inv, off] = steps;
    let r = await fetch(inv.call.split(" ")[1], { method: "PUT", headers: H, body: JSON.stringify(inv.body) });           // createOrReplaceInventoryItem
    if (!r.ok) return Response.json({ step: "inventory_item", error: await r.text() }, { status: 400, headers: cors });
    r = await fetch(API + "/sell/inventory/v1/offer", { method: "POST", headers: H, body: JSON.stringify(fill(off.body)) }); // createOffer
    const o = await r.json(); if (!r.ok) return Response.json({ step: "offer", error: o }, { status: 400, headers: cors });
    r = await fetch(`${API}/sell/inventory/v1/offer/${o.offerId}/publish`, { method: "POST", headers: H });                 // publishOffer
    return Response.json({ offerId: o.offerId, ...(await r.json()) }, { status: r.status, headers: cors });
  }
};
