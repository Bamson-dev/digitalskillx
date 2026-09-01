/**
 * Paste into GTM Custom HTML tag that fires on aimoneycode.com.ng/access-page-program/
 * Fires a dataLayer purchase event using stored ad tracking + Paystack reference from URL.
 */
(function () {
  setTimeout(function () {
    var urlParams = new URLSearchParams(window.location.search);
    var reference = urlParams.get("reference") || urlParams.get("trxref") || "";

    if (!reference) return;

    var trackingRaw = localStorage.getItem("adTracking");
    var tracking = trackingRaw ? JSON.parse(trackingRaw) : {};

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: "purchase_stape",
      ecommerce: {
        transaction_id: reference,
        value: 49999,
        currency: "NGN",
        items: [
          {
            item_id: "build-software-with-ai",
            item_name: "Build And Monetize Your Software With AI",
            price: 49999,
            quantity: 1,
          },
        ],
      },
      user_data: {
        fbclid: tracking.fbclid || "",
        fbc: tracking.fbc || "",
        fbp: tracking.fbp || "",
        utm_source: tracking.utm_source || "",
        utm_medium: tracking.utm_medium || "",
        utm_campaign: tracking.utm_campaign || "",
        ga_client_id: tracking.ga_client_id || "",
      },
    });

    localStorage.removeItem("adTracking");
  }, 500);
})();
