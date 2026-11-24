/** Small self-contained HTML pages for the customer links (no client JS). */
function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function customerPage(params: { title: string; body: string; form?: { action: string; token: string; button: string } }) {
  const form = params.form
    ? `<form method="post" action="${esc(params.form.action)}" style="margin:20px 0 0"><input type="hidden" name="t" value="${esc(params.form.token)}"/><button type="submit" style="background:#dc2626;color:#fff;border:0;border-radius:8px;padding:14px 24px;font-size:16px;font-weight:bold;cursor:pointer;width:100%">${esc(params.form.button)}</button></form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(params.title)} · DigitalSkillX</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:480px;margin:0 auto;padding:32px 16px">
<p style="font-size:20px;font-weight:bold;color:#dc2626;margin:0 0 16px">DigitalSkillX</p>
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(params.title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#334155">${params.body}</div>${form}
</div></div></body></html>`;
}

export function htmlResponseInit(status = 200): ResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  };
}

export { esc as escapeHtml };
