/**
 * Paste into WordPress custom HTML block or GTM Custom HTML tag on aimoneycode.com.ng landing pages.
 * Captures ad click IDs, UTM params, and GA4 client ID before Paystack redirect.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  const trackingData = {
    fbclid: fbclid || "",
    fbc: fbclid ? "fb.1." + Date.now() + "." + fbclid : "",
    fbp: (document.cookie.match(/_fbp=([^;]+)/) || [])[1] || "",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || "",
    ga_client_id: (document.cookie.match(/_ga=GA\d+\.\d+\.([^;]+)/) || [])[1] || "",
  };
  localStorage.setItem("adTracking", JSON.stringify(trackingData));
  sessionStorage.setItem("adTracking", JSON.stringify(trackingData));
})();
