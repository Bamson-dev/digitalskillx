<?php
// Offline tests for the WordPress snippets. No WordPress, no network, no real payments.
// Run: php scripts/ai-ads/test-wp-snippets.php
define('ABSPATH', __DIR__);
$GLOBALS['actions'] = array(); $GLOBALS['filters'] = array(); $GLOBALS['mock'] = null; $GLOBALS['calls'] = array();
$GLOBALS['options'] = array(); $GLOBALS['is_page'] = true;
function add_action($n, $f, $p = 10) { $GLOBALS['actions'][$n][] = $f; }
function add_filter($n, $f, $p = 10) { $GLOBALS['filters'][$n][] = $f; }
function get_option($k, $d = '') { return array_key_exists($k, $GLOBALS['options']) ? $GLOBALS['options'][$k] : $d; }
function is_page($id) { return $GLOBALS['is_page']; }
function wp_json_encode($v) { return json_encode($v, JSON_UNESCAPED_SLASHES); }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function wp_unslash($s) { return $s; }
function esc_html($s) { return htmlspecialchars((string)$s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string)$s, ENT_QUOTES); }
function esc_url($s) { return filter_var($s, FILTER_VALIDATE_URL) ? $s : ''; }
function esc_url_raw($s) { return $s; }
function untrailingslashit($s) { return rtrim($s, '/'); }
function nocache_headers() {} function status_header($c) {} function do_action() {}
function is_wp_error($x) { return $x instanceof WP_Error; }
class WP_Error {}
function wp_remote_get($url, $args = array()) { $GLOBALS['calls'][] = $url; return $GLOBALS['mock']; }
function wp_remote_retrieve_response_code($r) { return $r['code']; }
function wp_remote_retrieve_body($r) { return $r['body']; }

$fail = 0; $pass = 0;
$GLOBALS["log"] = array();
function check($label, $ok) { global $fail, $pass; if ($ok) { $pass++; $GLOBALS["log"][] = "PASS: $label"; } else { $fail++; $GLOBALS["log"][] = "FAIL: $label"; } }

$root = dirname(__DIR__, 2) . '/docs/wordpress/';
require $root . 'aimad-checkout-links-v1.php';
require $root . 'aimad-snippet-v2.php';

// ---------------------------------------------------------------- checkout links
$url = 'https://paystack.shop/pay/ai-ads-masterclass';
$html = '<a class="btn buy" href="#checkout">A</a>'
  . "<a href='#checkout' class='btn buy'>B</a>"
  . '<a id="x" class="buy" data-x="1" href="#checkout">C</a>'
  . '<a class="btn buy" href="#checkout" target="_self">D</a>'
  . '<a class="btn buy" href="#checkout">E</a><a class="btn buy" href="#checkout">F</a><a class="buy" href="#checkout">G</a>'
  . '<a class="nav" href="#checkout">keep</a><a href="/privacy/">keep2</a><a class="btn buy" href="https://paystack.shop/pay/aiapp">other</a>';
$out = aimad_rewrite_buy_links($html, $url);
check('C1. all seven buy links now point to the masterclass Paystack page', substr_count($out, 'href="' . $url . '"') === 7);
check('C2. no buy link points to #checkout', !preg_match('/class=["\'][^"\']*\bbuy\b[^"\']*["\'][^>]*href=["\']#checkout/i', $out) && substr_count($out, '#checkout') === 1);
check('C3. non-buy #checkout link and unrelated links are untouched', strpos($out, '<a class="nav" href="#checkout">keep</a>') !== false && strpos($out, '<a href="/privacy/">keep2</a>') !== false);
check('C4. a buy link to another product is not rewritten', strpos($out, 'https://paystack.shop/pay/aiapp') !== false);
check('C5. link text and other attributes are preserved', strpos($out, 'data-x="1"') !== false && strpos($out, 'target="_self"') !== false && strpos($out, '>G</a>') !== false);

$GLOBALS['options'] = array(); $content = $GLOBALS['filters']['the_content'][0]($html);
check('C6. switch off by default: content is unchanged', $content === $html);
$GLOBALS['options']['aimad_checkout_live'] = '1';
$content = $GLOBALS['filters']['the_content'][0]($html);
check('C7. switch on: content rewritten', substr_count($content, $url) === 7);
$GLOBALS['is_page'] = false;
check('C8. other pages are never rewritten', $GLOBALS['filters']['the_content'][0]($html) === $html);
$GLOBALS['is_page'] = true;

ob_start(); $GLOBALS['options'] = array(); $GLOBALS['actions']['wp_footer'][0](); $off = ob_get_clean();
check('C9. footer script prints nothing while switched off', $off === '');
$GLOBALS['options']['aimad_checkout_live'] = '1';
ob_start(); $GLOBALS['actions']['wp_footer'][0](); $on = ob_get_clean();
check('C10. footer script prints when on and carries the checkout URL', strpos($on, 'aimad-checkout-links') !== false && strpos($on, $url) !== false);
file_put_contents(sys_get_temp_dir() . '/aimad-footer.html', $on);

// ---------------------------------------------------------------- thank-you page
function ty($ref, $mock) {
    $_GET = $ref === null ? array() : array('reference' => $ref);
    $GLOBALS['mock'] = $mock; $GLOBALS['calls'] = array();
    ob_start(); @aimad_render_thankyou(); return ob_get_clean();
}
function resp($code, $arr) { return array('code' => $code, 'body' => is_string($arr) ? $arr : json_encode($arr)); }
$product = array('key' => 'ai-ads-automation-masterclass', 'title' => 'AI Ads Automation Masterclass', 'valueNgn' => 14999, 'currency' => 'NGN', 'courseUrl' => 'https://www.digitalskillx.com/courses/4e2a16b5-bbfb-4a00-939c-87c7eb5f2afb');
$ref = 'T123456789012';

$p = ty($ref, resp(200, array('status' => 'paid', 'fulfillment' => 'email_sent', 'enrolled' => true, 'emailSent' => true, 'product' => $product)));
check('T1. paid: success page, access button to the course, login link', strpos($p, 'aimad:paid') !== false && strpos($p, 'ACCESS YOUR PROGRAMME') !== false && strpos($p, $product['courseUrl']) !== false && strpos($p, 'digitalskillx.com/login') !== false);
check('T2. paid: the server is asked about this exact reference', $GLOBALS['calls'] === array('https://www.digitalskillx.com/api/purchase-status?reference=' . $ref));
check('T3. paid: Purchase uses eventID purchase_<reference>, NGN 14999, pixel 1043090941844015', strpos($p, '"eventID":"purchase_' . $ref . '"') !== false || strpos($p, 'eventID:"purchase_' . $ref . '"') !== false);
check('T3b. paid: value, currency, product id come from the server response', strpos($p, '"value":14999') !== false && strpos($p, '"currency":"NGN"') !== false && strpos($p, 'ai-ads-automation-masterclass') !== false && strpos($p, '1043090941844015') !== false);
check('T4. paid: refresh guard stops a second browser Purchase', strpos($p, 'localStorage.getItem') !== false && strpos($p, 'localStorage.setItem') !== false);
check('T5. paid: email sent wording', strpos($p, 'We sent your login details') !== false);

$p = ty($ref, resp(200, array('status' => 'paid', 'fulfillment' => 'enrolled', 'enrolled' => true, 'emailSent' => false, 'product' => $product)));
check('T6. paid but email not yet sent: tells the buyer it is being sent', strpos($p, 'We are sending your login details') !== false);

$p = ty($ref, resp(200, array('status' => 'pending', 'fulfillment' => 'none', 'enrolled' => false, 'emailSent' => false)));
check('T7. pending: stays pending, auto refreshes, no success, no Purchase, no access button', strpos($p, 'aimad:pending') !== false && strpos($p, 'http-equiv="refresh"') !== false && strpos($p, 'Purchase') === false && strpos($p, 'ACCESS YOUR PROGRAMME') === false && strpos($p, 'Do not pay twice') !== false);

$p = ty($ref, resp(200, array('status' => 'failed', 'fulfillment' => 'none', 'enrolled' => false, 'emailSent' => false)));
check('T8. failed: failure message, no success, no Purchase, no refresh loop', strpos($p, 'aimad:failed') !== false && strpos($p, 'Payment not completed') !== false && strpos($p, 'ACCESS YOUR PROGRAMME') === false && strpos($p, 'fbq') === false && strpos($p, 'http-equiv="refresh"') === false);

foreach (array('bad ref!', 'a', '../../etc', "x'><script>", str_repeat('A', 101)) as $bad) {
    $p = ty($bad, resp(200, array('status' => 'paid', 'enrolled' => true, 'product' => $product)));
    check('T9. invalid reference never reaches the server and never shows success: ' . substr($bad, 0, 12), strpos($p, 'aimad:noref') !== false && $GLOBALS['calls'] === array() && strpos($p, 'ACCESS YOUR PROGRAMME') === false && strpos($p, 'fbq') === false);
}
$p = ty(null, resp(200, array('status' => 'paid', 'product' => $product)));
check('T10. no reference: no success', strpos($p, 'aimad:noref') !== false && $GLOBALS['calls'] === array());

$p = ty($ref, resp(503, array('error' => 'Status unavailable')));
check('T11. server error: confirming state, never success', strpos($p, 'aimad:unavailable') !== false && strpos($p, 'ACCESS YOUR PROGRAMME') === false && strpos($p, 'fbq') === false);
$p = ty($ref, new WP_Error());
check('T12. network error: confirming state, never success', strpos($p, 'aimad:unavailable') !== false && strpos($p, 'fbq') === false);
$p = ty($ref, resp(200, 'not json'));
check('T13. garbage body: never success', strpos($p, 'aimad:unavailable') !== false);
$p = ty($ref, resp(200, array('status' => 'paid', 'enrolled' => true)));
check('T14. "paid" without a product or course URL is not shown as success', strpos($p, 'aimad:paid') === false && strpos($p, 'ACCESS YOUR PROGRAMME') === false && strpos($p, 'fbq') === false);
$p = ty($ref, resp(404, array('status' => 'paid', 'product' => $product)));
check('T15. non-200 status code with a paid body is ignored', strpos($p, 'aimad:paid') === false);

$_SERVER['REQUEST_URI'] = '/ai-ad/thank-you/?reference=' . $ref . '&status=success&paid=1&redirect_status=succeeded';
$p = ty($ref, resp(200, array('status' => 'pending', 'enrolled' => false)));
check('T16. success-looking query parameters are not proof of payment', strpos($p, 'aimad:pending') !== false);
$_GET = array('trxref' => $ref, 'reference' => $ref, 'status' => 'success');
$GLOBALS['mock'] = resp(200, array('status' => 'failed')); ob_start(); @aimad_render_thankyou(); $p = ob_get_clean();
check('T17. status=success in the URL cannot override a failed server answer', strpos($p, 'aimad:failed') !== false);

check('T18. the page contains no Paystack secret key lookup and no CAPI call', strpos(file_get_contents($root . 'aimad-snippet-v2.php'), 'paystack_secret') === false && strpos(file_get_contents($root . 'aimad-snippet-v2.php'), 'graph.facebook.com') === false);

echo implode("\n", $GLOBALS["log"]) . "\n\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
