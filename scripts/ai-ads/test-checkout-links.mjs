// Browser test for the Buy Now link script. Needs playwright. Run after test-wp-snippets.php
// (that script writes the footer script to the OS temp dir).
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const footer = readFileSync(`${tmpdir()}/aimad-footer.html`, "utf8");
const DEST = "https://paystack.shop/pay/ai-ads-masterclass";
const labels = ["YES, SHOW ME HOW","YES, I WANT THIS FOR MY BUSINESS","YES, I WANT IN","YES! I WANT THE COMPLETE TRAINING","YES! I WANT TO LEARN AI ADS AUTOMATION","Click here to join now.","GET INSTANT ACCESS"];
const buttons = labels.map((t, i) => `<a class="${i === 5 ? "buy" : "btn buy"}" href="#checkout">${t}</a>`).join("<br>");
const page = `<!doctype html><html><body><a class="nav" href="#checkout">menu</a><a href="/privacy/">privacy</a>${buttons}
<script>window.__ic=0;document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.buy');if(a){var h=a.getAttribute('href')||'';if(h&&h.charAt(0)!=='#')window.__ic++;}},true);</script>
${footer}</body></html>`;

let pass = 0;
const ok = (label, fn) => { fn(); pass += 1; console.log("PASS:", label); };
const browser = await chromium.launch();

async function run(viewport, search, cookie) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const pg = await ctx.newPage();
  await pg.route("https://aimoneycode.com.ng/**", (r) => r.fulfill({ contentType: "text/html", body: page }));
  await pg.route("https://paystack.shop/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>checkout</title>" }));
  if (cookie) await ctx.addCookies([{ name: "aimad_attr", value: encodeURIComponent(JSON.stringify(cookie)), url: "https://aimoneycode.com.ng/" }]);
  await pg.goto("https://aimoneycode.com.ng/ai-ad/" + search);
  const hrefs = await pg.$$eval("a.buy", (as) => as.map((a) => a.getAttribute("href")));
  const other = await pg.$$eval("a:not(.buy)", (as) => as.map((a) => a.getAttribute("href")));
  return { ctx, pg, hrefs, other };
}

const q = "?utm_source=facebook&utm_medium=paid&utm_campaign=ai%20ads%20nov&utm_content=v1&utm_term=t&fbclid=IwAR_abc-123&unrelated=drop";
for (const [name, vp] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
  const { ctx, pg, hrefs, other } = await run(vp, q);
  ok(`${name}: seven buy buttons found`, () => assert.equal(hrefs.length, 7));
  ok(`${name}: none points to #checkout`, () => assert.equal(hrefs.filter((h) => h.includes("#checkout")).length, 0));
  ok(`${name}: all seven go to the masterclass page`, () => hrefs.forEach((h) => assert.equal(new URL(h).origin + new URL(h).pathname, DEST)));
  ok(`${name}: UTM values and fbclid are kept exactly`, () => hrefs.forEach((h) => {
    const p = new URL(h).searchParams;
    assert.equal(p.get("utm_source"), "facebook"); assert.equal(p.get("utm_medium"), "paid");
    assert.equal(p.get("utm_campaign"), "ai ads nov"); assert.equal(p.get("utm_content"), "v1");
    assert.equal(p.get("utm_term"), "t"); assert.equal(p.get("fbclid"), "IwAR_abc-123");
  }));
  ok(`${name}: unrelated parameters are not forwarded`, () => hrefs.forEach((h) => assert.equal(new URL(h).searchParams.get("unrelated"), null)));
  ok(`${name}: non-buy links untouched`, () => assert.deepEqual(other, ["#checkout", "/privacy/"]));
  // Click every button and confirm the browser really navigates to the right place.
  for (let i = 0; i < 7; i++) {
    await pg.goto("https://aimoneycode.com.ng/ai-ad/" + q);
    const els = await pg.$$("a.buy");
    const [nav] = await Promise.all([pg.waitForURL(/paystack\.shop/), name === "mobile" ? els[i].tap() : els[i].click()]);
    const u = new URL(pg.url());
    assert.equal(u.origin + u.pathname, DEST, `button ${i + 1}`);
    assert.equal(u.searchParams.get("fbclid"), "IwAR_abc-123", `button ${i + 1} fbclid`);
    assert.equal(u.searchParams.get("utm_campaign"), "ai ads nov", `button ${i + 1} utm`);
  }
  pass += 1; console.log(`PASS: ${name}: each of the seven buttons navigates to the Paystack page with attribution`);
  await pg.goto("https://aimoneycode.com.ng/ai-ad/" + q);
  const ic = await pg.evaluate(() => {
    document.addEventListener("click", (e) => e.preventDefault());
    document.querySelector("a.buy").click();
    return window.__ic;
  });
  ok(`${name}: the existing InitiateCheckout listener sees a real checkout URL (counted ${ic})`, () => assert.equal(ic, 1));
  await ctx.close();
}

{ // no parameters in the URL, attribution only in the first-party cookie
  const { ctx, hrefs } = await run({ width: 1280, height: 800 }, "", { utm_source: "ig", fbclid: "IwAR_cookie" });
  ok("cookie fallback restores utm_source and fbclid on a return visit", () => hrefs.forEach((h) => {
    const p = new URL(h).searchParams; assert.equal(p.get("utm_source"), "ig"); assert.equal(p.get("fbclid"), "IwAR_cookie");
  }));
  await ctx.close();
}
{ // URL parameters win over the cookie
  const { ctx, hrefs } = await run({ width: 1280, height: 800 }, "?utm_source=fb", { utm_source: "ig", utm_medium: "social" });
  ok("URL parameters win, cookie fills the gaps", () => hrefs.forEach((h) => {
    const p = new URL(h).searchParams; assert.equal(p.get("utm_source"), "fb"); assert.equal(p.get("utm_medium"), "social");
  }));
  await ctx.close();
}
{ // no attribution at all
  const { ctx, hrefs } = await run({ width: 1280, height: 800 }, "");
  ok("no attribution: clean checkout URL with no empty parameters", () => hrefs.forEach((h) => assert.equal(h, DEST)));
  await ctx.close();
}
{ // hostile values cannot add parameters or change the destination
  const { ctx, hrefs } = await run({ width: 1280, height: 800 }, "?utm_source=x%26pay%3Devil%23&fbclid=%2F%2Fevil.com");
  ok("hostile parameter values stay encoded and never change host or path", () => hrefs.forEach((h) => {
    const u = new URL(h); assert.equal(u.origin + u.pathname, DEST); assert.equal(u.searchParams.get("pay"), null);
  }));
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed`);
