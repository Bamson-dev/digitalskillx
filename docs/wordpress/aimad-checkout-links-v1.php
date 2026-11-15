<?php
/**
 * AI Ad Masterclass: Buy Now buttons -> Paystack checkout, keeping UTM and fbclid.
 * Separate snippet. It does not touch the Meta events snippet or the page content.
 *
 * SAFE BY DEFAULT: it does nothing until the option aimad_checkout_live is "1".
 * Switch on at launch:  Code Snippets > run once  update_option('aimad_checkout_live', '1');
 * Rollback instantly:   update_option('aimad_checkout_live', '0');  or deactivate this snippet.
 */
if (!defined('ABSPATH')) { return; }

if (!function_exists('aimad_checkout_cfg')) {

function aimad_checkout_cfg() {
    return array(
        'url'        => 'https://paystack.shop/pay/ai-ads-masterclass',
        'landing_id' => 247,
        'live'       => get_option('aimad_checkout_live', '0') === '1',
        'keys'       => array('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'),
    );
}

/* Rewrites href="#checkout" on a.buy links. Pure function so it can be tested without WordPress. */
function aimad_rewrite_buy_links($html, $url) {
    return preg_replace_callback('/<a\b[^>]*>/i', function ($m) use ($url) {
        $tag = $m[0];
        if (!preg_match('/\bclass\s*=\s*(["\'])(?:(?!\1).)*\bbuy\b(?:(?!\1).)*\1/i', $tag)) { return $tag; }
        return preg_replace('/\bhref\s*=\s*(["\'])#checkout\1/i', 'href="' . esc_url_raw_aimad($url) . '"', $tag);
    }, $html);
}
function esc_url_raw_aimad($u) { return function_exists('esc_url_raw') ? esc_url_raw($u) : $u; }

/* 1. Server side baseline (works without JavaScript). */
add_filter('the_content', function ($content) {
    $c = aimad_checkout_cfg();
    if (!$c['live'] || !is_page($c['landing_id'])) { return $content; }
    return aimad_rewrite_buy_links($content, $c['url']);
}, 99);

/* 2. Client side: add UTM and fbclid to every buy link. Runs on load and again at click time. */
add_action('wp_footer', function () {
    $c = aimad_checkout_cfg();
    if (!$c['live'] || !is_page($c['landing_id'])) { return; }
    $cfg = array('url' => $c['url'], 'keys' => $c['keys']);
    $js = <<<'JS'
(function () {
  var C = window.AIMAD_CHECKOUT || {};
  function fromCookie() {
    try {
      var m = document.cookie.match(/(?:^|; )aimad_attr=([^;]*)/);
      return m ? JSON.parse(decodeURIComponent(m[1])) : {};
    } catch (e) { return {}; }
  }
  function target() {
    var u = new URL(C.url), q = new URLSearchParams(location.search), saved = fromCookie();
    C.keys.forEach(function (k) {
      var v = q.get(k) || saved[k];
      if (v) { u.searchParams.set(k, String(v).slice(0, 150)); }
    });
    return u.toString();
  }
  function links() { return Array.prototype.slice.call(document.querySelectorAll('a.buy')); }
  function apply() { var t = target(); links().forEach(function (a) { a.setAttribute('href', t); }); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', apply); } else { apply(); }
  // Capture phase runs before the Meta InitiateCheckout listener and before navigation.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a.buy') : null;
    if (a) { a.setAttribute('href', target()); }
  }, true);
})();
JS;
    echo "<script id=\"aimad-checkout-links\">\nwindow.AIMAD_CHECKOUT=" . wp_json_encode($cfg) . ";\n" . $js . "\n</script>\n";
}, 99);

} // end function_exists guard
