<?php
/**
 * AI Ad Masterclass v2: landing events and DSX-verified thank-you page. NOT ACTIVE until DSX deploys.
 * Pixel: Bamz Pixel 001 (1043090941844015). Landing page: /ai-ad/ (page ID 247).
 * Leaves the existing AIM funnel snippet and the GTM container untouched.
 */
if (!defined('ABSPATH')) { return; }

if (!function_exists('aimad_cfg')) {

function aimad_cfg() {
    return array(
        'pixel_id'   => '1043090941844015',
        'landing_id' => 247,
        'name'       => 'AI Ads Automation Masterclass',
        'content_id' => 'ai-ads-automation-masterclass',
        'price'      => 14999,
        'currency'   => 'NGN',
        'ty_path'    => '/ai-ad/thank-you',
        'support_wa' => '2349067285890',
    );
}

/* ---------- 1. Landing page: PageView, ViewContent, InitiateCheckout, attribution cookie ---------- */

add_action('wp_footer', function () {
    $c = aimad_cfg();
    if (!is_page($c['landing_id'])) { return; }
    $cfg = array(
        'pid'   => $c['pixel_id'],
        'name'  => $c['name'],
        'cid'   => $c['content_id'],
        'value' => $c['price'],
        'cur'   => $c['currency'],
    );
    $js = <<<'JS'
(function () {
  var C = window.AIMAD || {};
  function uid(p) { return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }

  // Keep ad attribution in a first-party cookie so the server can read it after the payment redirect.
  try {
    var q = new URLSearchParams(location.search), keys = ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'], o = {}, has = false;
    keys.forEach(function (k) { var v = q.get(k); if (v) { o[k] = v.slice(0, 150); has = true; } });
    if (has) {
      document.cookie = 'aimad_attr=' + encodeURIComponent(JSON.stringify(o)) + '; max-age=' + (60 * 60 * 24 * 90) + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    }
  } catch (e) {}

  function ready() { return window.fbq && fbq.instance && fbq.instance.pixelsByID && fbq.instance.pixelsByID[C.pid]; }
  var content = { content_name: C.name, content_type: 'product', content_ids: [C.cid], value: C.value, currency: C.cur };

  var tries = 0;
  (function wait() {
    if (ready()) {
      fbq('trackSingle', C.pid, 'PageView', {}, { eventID: uid('pv') });
      fbq('trackSingle', C.pid, 'ViewContent', content, { eventID: uid('vc') });
    } else if (tries++ < 200) {
      setTimeout(wait, 100);
    }
  })();

  // InitiateCheckout only when a buy button points at a real checkout URL (not the "#checkout" placeholder).
  var last = 0;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a.buy') : null;
    if (!a) { return; }
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') { return; }
    if (!ready()) { return; }
    var now = Date.now();
    if (now - last < 2000) { return; }
    last = now;
    var d = { content_name: C.name, content_type: 'product', content_ids: [C.cid], value: C.value, currency: C.cur, num_items: 1 };
    fbq('trackSingle', C.pid, 'InitiateCheckout', d, { eventID: uid('ic') });
  }, true);
})();
JS;
    echo "<script id=\"aimad-meta-events\">\nwindow.AIMAD=" . wp_json_encode($cfg) . ";\n" . $js . "\n</script>\n";
}, 100);

/* ---------- 2. Thank-you page: success only when DigitalSkillX reports paid ---------- */

function aimad_ref() {
    foreach (array('reference', 'trxref') as $k) {
        if (!empty($_GET[$k])) {
            $r = sanitize_text_field(wp_unslash($_GET[$k]));
            return preg_match('/^[A-Za-z0-9_.\-]{4,100}$/', $r) ? $r : '';
        }
    }
    return '';
}

/* Returns array('state' => paid|pending|failed|unavailable|noref, 'data' => array). No secrets involved. */
function aimad_status($ref) {
    $base = defined('AIMAD_DSX_BASE') ? AIMAD_DSX_BASE : 'https://www.digitalskillx.com';
    $res = wp_remote_get($base . '/api/purchase-status?reference=' . rawurlencode($ref), array('timeout' => 10));
    if (is_wp_error($res) || (int) wp_remote_retrieve_response_code($res) !== 200) {
        return array('state' => 'unavailable', 'data' => array());
    }
    $d = json_decode(wp_remote_retrieve_body($res), true);
    if (!is_array($d) || empty($d['status'])) { return array('state' => 'unavailable', 'data' => array()); }
    return array('state' => $d['status'], 'data' => $d);
}

add_action('template_redirect', function () {
    $c = aimad_cfg();
    $path = isset($_SERVER['REQUEST_URI']) ? strtolower(untrailingslashit(strtok($_SERVER['REQUEST_URI'], '?'))) : '';
    if ($path !== $c['ty_path']) { return; }
    aimad_render_thankyou();
    exit;
}, 1);

function aimad_render_thankyou() {
    $c = aimad_cfg();
    if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
    if (!defined('LSCACHE_NO_CACHE')) { define('LSCACHE_NO_CACHE', true); }
    do_action('litespeed_control_set_nocache', 'ai-ad thank-you is dynamic');
    nocache_headers();
    status_header(200);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');

    $ref = aimad_ref();
    $s = $ref ? aimad_status($ref) : array('state' => 'noref', 'data' => array());
    $state = $s['state'];
    $d = $s['data'];
    $paid = ($state === 'paid' && !empty($d['product']['courseUrl']));
    $course = $paid ? $d['product']['courseUrl'] : '';
    $email_sent = $paid && !empty($d['emailSent']);

    $wa_text = 'Hi, I paid for the ' . $c['name'] . '.' . ($ref ? ' My payment reference is ' . $ref . '.' : '');
    $wa = 'https://wa.me/' . $c['support_wa'] . '?text=' . rawurlencode($wa_text);
    $login = 'https://www.digitalskillx.com/login';

    $copy = array(
        'paid'        => array('Your payment is confirmed', 'Your enrolment is complete.'),
        'pending'     => array('We are confirming your payment', 'This page checks again automatically. It usually takes under a minute.'),
        'unavailable' => array('We are confirming your payment', 'We could not reach the confirmation service. This page checks again automatically.'),
        'failed'      => array('Payment not completed', 'Paystack reports this payment as failed. If your bank charged you, message support with your reference.'),
        'noref'       => array('No payment found', 'Open this page from the link you land on after paying on Paystack.'),
    );
    $h = isset($copy[$state]) ? $copy[$state] : $copy['pending'];
    $waiting = ($state === 'pending' || $state === 'unavailable');

    $pixel = wp_json_encode($c['pixel_id']);
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">';
    if ($waiting) { echo '<meta http-equiv="refresh" content="8">'; }
    echo '<title>' . esc_html($h[0]) . ' | Ai Money Code</title>';
    echo '<style>*{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#1d1d1d;font:400 17px/1.6 Arial,sans-serif}.wrap{max-width:640px;margin:0 auto;padding:28px 16px 48px}.card{background:#fff;border-radius:14px;padding:32px 24px;box-shadow:0 6px 24px rgba(15,39,71,.08);border-top:6px solid ' . ($paid ? '#18a957' : '#c8102e') . '}h1{font-size:28px;color:#0f2747;margin:0 0 12px;text-align:center}.lead{text-align:center;color:#5a5a5a}.btn{display:block;text-align:center;background:#18a957;color:#fff;text-decoration:none;font-weight:700;padding:16px 20px;border-radius:8px;margin:16px 0}.btn.alt{background:#0f2747}li{margin-bottom:8px}.small{font-size:14px;color:#5a5a5a;text-align:center}</style>';
    if ($paid) {
        // Browser Purchase fires once per reference per browser, same eventID as the DSX server event so Meta dedups.
        $pd = array(
            'value'        => (float) $d['product']['valueNgn'],
            'currency'     => $d['product']['currency'],
            'content_name' => $d['product']['title'],
            'content_type' => 'product',
            'content_ids'  => array($d['product']['key']),
            'num_items'    => 1,
        );
        echo '<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");';
        echo 'fbq("init",' . $pixel . ');fbq("trackSingle",' . $pixel . ',"PageView",{},{eventID:"pv_ty_"+Date.now().toString(36)});';
        echo 'try{var k="aimad_purchase_"+' . wp_json_encode($ref) . ';if(!localStorage.getItem(k)){localStorage.setItem(k,"1");fbq("trackSingle",' . $pixel . ',"Purchase",' . wp_json_encode($pd) . ',{eventID:' . wp_json_encode('purchase_' . $ref) . '});}}catch(e){}';
        echo '</script>';
    }
    echo '</head><body><!-- aimad:' . esc_html($state) . ' --><div class="wrap"><div class="card">';
    echo '<h1>' . esc_html($h[0]) . '</h1><p class="lead">' . esc_html($h[1]) . '</p>';
    if ($paid) {
        echo '<a class="btn" href="' . esc_url($course) . '">ACCESS YOUR PROGRAMME</a>';
        echo '<ol>';
        echo '<li>' . ($email_sent ? 'We sent your login details to the email you used to pay.' : 'We are sending your login details to the email you used to pay. It can take a few minutes.') . '</li>';
        echo '<li>New student: sign in with the email and temporary password in that message, then change the password.</li>';
        echo '<li>Existing student: sign in with your usual password. The course is already on your account.</li>';
        echo '<li>No email after 15 minutes? Check spam, then use the password reset on the login page or message support.</li></ol>';
        echo '<a class="btn alt" href="' . esc_url($login) . '">Go to login</a>';
    }
    if ($waiting) { echo '<p class="small">Checking again in a few seconds. Do not pay twice.</p>'; }
    echo '<a class="btn alt" href="' . esc_url($wa) . '">Message WhatsApp Support</a>';
    if ($ref) { echo '<p class="small">Reference: ' . esc_html($ref) . '</p>'; }
    echo '</div></div></body></html>';
}

} // end function_exists guard
