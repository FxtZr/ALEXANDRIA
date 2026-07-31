/* ALEXANDRIA -- payload inspection.
 *
 * Takes the text a QR code decoded to and reports what it is and what is
 * worth knowing about it. Pure functions: nothing here touches the DOM,
 * opens anything, or reaches the network. That is the whole point of the
 * program, and keeping the engine incapable of acting is the simplest way
 * to guarantee it.
 *
 * One thing this engine never does is say that something is safe. It
 * reports what it found. An empty findings list means nothing matched the
 * checks below, which is a much weaker claim, and the interface has to say
 * so rather than let silence be read as approval.
 */
(function (root) {
  "use strict";

  var CRITICAL = "critical";
  var WARNING = "warning";
  var NOTE = "note";

  /* ---------------------------------------------------------------------
   * Script identification
   * ------------------------------------------------------------------- */

  /* Enough of Unicode to answer the only question that matters here: are
   * the characters of this label drawn from more than one writing system?
   * A domain mixing scripts is either a mistake or an attack, and it is
   * almost never a mistake. */
  var SCRIPT_RANGES = [
    [0x0041, 0x005a, "Latin"], [0x0061, 0x007a, "Latin"],
    [0x00c0, 0x024f, "Latin"], [0x1e00, 0x1eff, "Latin"],
    [0x0370, 0x03ff, "Greek"], [0x1f00, 0x1fff, "Greek"],
    [0x0400, 0x052f, "Cyrillic"], [0x2de0, 0x2dff, "Cyrillic"],
    [0x0530, 0x058f, "Armenian"],
    [0x0590, 0x05ff, "Hebrew"],
    [0x0600, 0x06ff, "Arabic"], [0x0750, 0x077f, "Arabic"],
    [0x0900, 0x097f, "Devanagari"],
    [0x0e00, 0x0e7f, "Thai"],
    [0x1100, 0x11ff, "Hangul"], [0xac00, 0xd7af, "Hangul"],
    [0x3040, 0x309f, "Hiragana"], [0x30a0, 0x30ff, "Katakana"],
    [0x4e00, 0x9fff, "Han"], [0x3400, 0x4dbf, "Han"]
  ];

  function scriptOf(codePoint) {
    if (codePoint < 0x0080) {
      // digits and hyphen belong to no script in particular
      if (codePoint >= 0x0030 && codePoint <= 0x0039) return "Common";
      if (codePoint === 0x002d) return "Common";
      if ((codePoint >= 0x0041 && codePoint <= 0x005a)
          || (codePoint >= 0x0061 && codePoint <= 0x007a)) return "Latin";
      return "Common";
    }
    for (var i = 0; i < SCRIPT_RANGES.length; i++) {
      if (codePoint >= SCRIPT_RANGES[i][0]
          && codePoint <= SCRIPT_RANGES[i][1]) {
        return SCRIPT_RANGES[i][2];
      }
    }
    return "Other";
  }

  function scriptsIn(text) {
    var found = {};
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      if (cp > 0xffff) i++;
      var script = scriptOf(cp);
      if (script !== "Common") found[script] = true;
    }
    return Object.keys(found);
  }

  /* ---------------------------------------------------------------------
   * Characters that impersonate Latin letters
   * ------------------------------------------------------------------- */

  /* Not the full Unicode confusables table, which is enormous. These are
   * the characters that render as an ordinary Latin letter in the fonts a
   * browser uses for an address bar, which is the only set that matters
   * for reading a domain. */
  var CONFUSABLE = {
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p",
    "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u0456": "i",
    "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u04bb": "h",
    "\u04cf": "l", "\u043a": "k", "\u043c": "m", "\u0442": "t",
    "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K",
    "\u041c": "M", "\u041d": "H", "\u041e": "O", "\u0420": "P",
    "\u0421": "C", "\u0422": "T", "\u0423": "Y", "\u0425": "X",
    "\u0408": "J", "\u0405": "S", "\u0406": "I",
    "\u03b1": "a", "\u03bf": "o", "\u03c1": "p", "\u03bd": "v",
    "\u03c4": "t", "\u03ba": "k", "\u03b9": "i", "\u03b5": "e",
    "\u03c5": "u", "\u03c7": "x",
    "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z",
    "\u0397": "H", "\u0399": "I", "\u039a": "K", "\u039c": "M",
    "\u039d": "N", "\u039f": "O", "\u03a1": "P", "\u03a4": "T",
    "\u03a5": "Y", "\u03a7": "X",
    "\u217c": "l", "\u2170": "i", "\u2171": "ii",
    "\uff41": "a", "\uff45": "e", "\uff4f": "o", "\uff50": "p"
  };

  /* Characters that occupy no visual space, or reverse the order of what
   * follows. Either one lets a name read as something it is not. */
  var INVISIBLE = {
    "\u200b": "zero-width space", "\u200c": "zero-width non-joiner",
    "\u200d": "zero-width joiner", "\ufeff": "byte order mark",
    "\u00ad": "soft hyphen", "\u2060": "word joiner",
    "\u180e": "Mongolian vowel separator"
  };

  var BIDI = {
    "\u202a": "left-to-right embedding", "\u202b": "right-to-left embedding",
    "\u202c": "pop directional formatting",
    "\u202d": "left-to-right override", "\u202e": "right-to-left override",
    "\u2066": "left-to-right isolate", "\u2067": "right-to-left isolate",
    "\u2068": "first strong isolate", "\u2069": "pop directional isolate"
  };

  /* ---------------------------------------------------------------------
   * Reference lists
   * ------------------------------------------------------------------- */

  /* Not exhaustive, and cannot be. A shortener that is not on this list
   * still hides its destination; the interface says so. */
  var SHORTENERS = [
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
    "adf.ly", "bit.do", "cutt.ly", "rebrand.ly", "shorturl.at", "tiny.cc",
    "rb.gy", "s.id", "lnkd.in", "t.ly", "short.io", "v.gd", "x.co",
    "clck.ru", "vk.cc", "u.to", "chilp.it", "tr.im", "qr.ae", "soo.gd",
    "shrtco.de", "gg.gg", "urlz.fr", "lien.li"
  ];

  /* Registries where a domain costs little or nothing, which is why
   * disposable phishing infrastructure concentrates there. Plenty of
   * ordinary sites use them too, so this is a note and never more. */
  var CHEAP_TLDS = [
    "tk", "ml", "ga", "cf", "gq", "top", "buzz", "click", "link", "work",
    "icu", "rest", "cyou", "sbs", "cfd", "quest", "bar", "monster"
  ];

  /* Labels that look like the end of a domain. Seeing one in the middle is
   * the "paypal.com.evil.tk" pattern. */
  var TLD_LOOKALIKES = [
    "com", "org", "net", "gov", "edu", "co", "io", "info", "biz"
  ];

  var DANGEROUS_SCHEMES = {
    "javascript": "runs code in whatever page opens it",
    "vbscript": "runs code in whatever page opens it",
    "data": "carries an entire document inline, which can be a whole fake page"
  };

  /* ---------------------------------------------------------------------
   * Findings
   * ------------------------------------------------------------------- */

  function Report(raw) {
    this.raw = raw;
    this.type = "text";
    this.label = "Plain text";
    this.fields = [];
    this.findings = [];
  }

  Report.prototype.add = function (level, code, title, detail) {
    this.findings.push({ level: level, code: code, title: title,
                         detail: detail });
    return this;
  };

  Report.prototype.field = function (name, value, note) {
    if (value === null || value === undefined || value === "") return this;
    this.fields.push({ name: name, value: String(value), note: note || null });
    return this;
  };

  Report.prototype.worst = function () {
    var order = { critical: 3, warning: 2, note: 1 };
    var top = 0;
    this.findings.forEach(function (f) {
      if (order[f.level] > top) top = order[f.level];
    });
    return ["none", NOTE, WARNING, CRITICAL][top];
  };

  /* ---------------------------------------------------------------------
   * Shared text checks
   * ------------------------------------------------------------------- */

  function checkHiddenCharacters(report, text, where) {
    var invisible = [];
    var bidi = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (INVISIBLE[ch] && invisible.indexOf(INVISIBLE[ch]) < 0) {
        invisible.push(INVISIBLE[ch]);
      }
      if (BIDI[ch] && bidi.indexOf(BIDI[ch]) < 0) bidi.push(BIDI[ch]);
    }
    if (invisible.length) {
      report.add(CRITICAL, "INVISIBLE_CHARS",
        "Contains characters that take up no space",
        "The " + where + " holds " + invisible.join(", ") + ". These are "
        + "invisible when displayed, so what you read is not what is "
        + "actually there. There is no legitimate reason for them here.");
    }
    if (bidi.length) {
      report.add(CRITICAL, "BIDI_OVERRIDE",
        "Contains characters that reverse reading order",
        "The " + where + " holds " + bidi.join(", ") + ". These reorder the "
        + "text on screen, so a name can be made to read as something "
        + "entirely different from what it says.");
    }
  }

  /* ---------------------------------------------------------------------
   * Host analysis
   * ------------------------------------------------------------------- */

  function analyseHost(report, host) {
    if (!host) return;

    var puny = root.ALEXANDRIA.punycode.toUnicode(host);
    var shown = puny.text;

    report.field("Host", host);
    if (puny.decoded) {
      report.field("Host, as displayed", shown,
                   "This is what an address bar shows for that host.");
    }
    if (puny.malformed) {
      report.add(WARNING, "PUNYCODE_MALFORMED",
        "An internationalised label will not decode",
        "Part of the host begins xn-- but is not valid punycode. Software "
        + "may disagree about what it means, which is itself a way to hide "
        + "where a link goes.");
    }

    checkHiddenCharacters(report, shown, "host");

    var labels = shown.split(".");
    var rawLabels = host.split(".");

    labels.forEach(function (label, index) {
      if (!label) return;

      var scripts = scriptsIn(label);
      if (scripts.length > 1) {
        report.add(CRITICAL, "MIXED_SCRIPT",
          "One part of the host mixes writing systems",
          "The label \u201c" + label + "\u201d contains "
          + scripts.join(" and ") + " characters together. Letters from "
          + "different alphabets can look identical, and mixing them is how "
          + "a familiar name is imitated.");
        return;
      }

      if (scripts.length === 1 && scripts[0] !== "Latin") {
        var mapped = "";
        var allMappable = label.length > 0;
        for (var i = 0; i < label.length; i++) {
          var ch = label[i];
          if (CONFUSABLE[ch]) mapped += CONFUSABLE[ch];
          else if (/[0-9-]/.test(ch)) mapped += ch;
          else { allMappable = false; break; }
        }
        if (allMappable && /[a-z]/i.test(mapped)) {
          report.add(CRITICAL, "LOOKALIKE_LABEL",
            "A part of the host is not the alphabet it appears to be",
            "The label reads as \u201c" + mapped + "\u201d but every letter "
            + "in it is " + scripts[0] + ", not Latin. It resolves to a "
            + "completely different site from the one it resembles.");
        }
      }

      // punycode that decodes to plain ASCII has no legitimate purpose
      var raw = rawLabels[index] || "";
      if (raw.toLowerCase().indexOf("xn--") === 0 && /^[\x20-\x7e]*$/.test(label)) {
        report.add(WARNING, "POINTLESS_PUNYCODE",
          "A label is encoded when it did not need to be",
          "\u201c" + raw + "\u201d decodes to plain ASCII. Punycode exists "
          + "to carry characters that ASCII cannot, so encoding ASCII in it "
          + "serves only to make a host harder to read.");
      }
    });

    // a TLD-shaped label anywhere but the end
    for (var j = 0; j < labels.length - 1; j++) {
      if (TLD_LOOKALIKES.indexOf(labels[j].toLowerCase()) >= 0 && j > 0) {
        report.add(WARNING, "TLD_IN_MIDDLE",
          "The host puts a domain ending in the middle",
          "\u201c" + labels[j] + "\u201d appears part-way through the host, "
          + "so the real site is " + labels.slice(-2).join(".")
          + " and everything before it is chosen freely by whoever owns "
          + "that.");
        break;
      }
    }

    if (labels.length > 5) {
      report.add(NOTE, "MANY_LABELS", "The host has unusually many parts",
        labels.length + " dot-separated parts. Long chains are sometimes "
        + "used to push the real domain off the edge of a narrow screen.");
    }

    var registrable = labels.slice(-2).join(".").toLowerCase();
    if (SHORTENERS.indexOf(registrable) >= 0) {
      report.add(WARNING, "SHORTENER", "This is a shortened link",
        "The destination is decided by " + registrable + " and is not "
        + "visible here. Shorteners are ordinary tools, and they are also "
        + "the simplest way to conceal where a link goes.");
    }

    var tld = labels[labels.length - 1].toLowerCase();
    if (CHEAP_TLDS.indexOf(tld) >= 0) {
      report.add(NOTE, "CHEAP_TLD", "A registry where domains are very cheap",
        "Names ending ." + tld + " cost little or nothing, which is why "
        + "disposable sites concentrate there. Plenty of ordinary sites use "
        + "them too, so this on its own means little.");
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(":") >= 0) {
      report.add(WARNING, "IP_HOST", "The address points at a number, not a name",
        "There is no domain to recognise or check, and no certificate tied "
        + "to a name. Legitimate links to a public service almost never "
        + "look like this.");
    }
  }

  /* ---------------------------------------------------------------------
   * URLs
   * ------------------------------------------------------------------- */

  function looksLikeBareDomain(text) {
    return /^[a-z0-9\u0080-\uffff][-a-z0-9\u0080-\uffff.]*\.[a-z\u0080-\uffff]{2,}(\/|$|\?)/i
      .test(text) && text.indexOf(" ") < 0;
  }

  function inspectURL(report, text, hadScheme) {
    report.type = "url";
    report.label = "Web address";

    checkHiddenCharacters(report, text, "address");

    var schemeMatch = text.match(/^([a-z][a-z0-9+.-]*):/i);
    var scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "";

    if (DANGEROUS_SCHEMES[scheme]) {
      report.type = "code";
      report.label = "Executable content";
      report.field("Scheme", scheme + ":");
      report.field("Content", text.slice(scheme.length + 1));
      report.add(CRITICAL, "DANGEROUS_SCHEME",
        "This is not a link to a page",
        "It begins " + scheme + ":, which " + DANGEROUS_SCHEMES[scheme]
        + ". A QR code has no reason to carry this.");
      return report;
    }

    var url = null;
    try {
      url = new URL(hadScheme ? text : "http://" + text);
    } catch (err) {
      report.field("Address", text);
      report.add(WARNING, "UNPARSEABLE", "The address will not parse",
        "It begins like a web address but is not one. Software may "
        + "disagree about what it means.");
      return report;
    }

    report.field("Scheme", url.protocol.replace(":", ""));

    if (url.username || url.password) {
      report.add(CRITICAL, "EMBEDDED_CREDENTIALS",
        "Everything before the @ sign is ignored",
        "This address carries a username" + (url.password ? " and password" : "")
        + " before an @ sign. A browser ignores that part and goes to \u201c"
        + url.hostname + "\u201d. It is the oldest way of making a link "
        + "appear to point somewhere it does not.");
      report.field("Text before the @", url.username
        + (url.password ? ":" + url.password : ""));
    }

    analyseHost(report, url.hostname);

    if (url.port) {
      report.field("Port", url.port);
      report.add(NOTE, "UNUSUAL_PORT", "A non-standard port",
        "Web traffic normally uses 80 or 443. Port " + url.port + " is not "
        + "wrong, but ordinary sites rarely need it.");
    }

    if (url.protocol === "http:") {
      report.add(WARNING, "NOT_ENCRYPTED", "The connection would not be encrypted",
        "Anything sent to this address travels in the clear and can be read "
        + "or altered along the way.");
    }

    if (url.pathname && url.pathname !== "/") report.field("Path", url.pathname);
    if (url.search) report.field("Query", url.search);

    var rest = url.pathname + url.search + url.hash;
    var embedded = rest.match(/https?(%3A|:)(%2F|\/){2}/i);
    if (embedded) {
      report.add(WARNING, "EMBEDDED_URL", "Another address is carried inside this one",
        "The link contains a second web address in its parameters. This is "
        + "how a trusted domain can be used to forward you somewhere else.");
    }

    var encoded = (rest.match(/%[0-9a-f]{2}/gi) || []).length;
    if (encoded > 12) {
      report.add(NOTE, "HEAVY_ENCODING", "Much of the address is encoded",
        encoded + " escape sequences. Encoding is normal in small amounts; "
        + "in quantity it makes an address unreadable to a person while "
        + "leaving it perfectly readable to software.");
    }

    if (text.length > 200) {
      report.add(NOTE, "VERY_LONG", "An unusually long address",
        text.length + " characters. Length alone means little, but it does "
        + "mean you cannot check it at a glance.");
    }

    return report;
  }

  /* ---------------------------------------------------------------------
   * Structured non-URL payloads
   * ------------------------------------------------------------------- */

  /* Fields separated by semicolons, with backslash escapes.
   *
   * Written as a character loop rather than a regular expression on
   * purpose: splitting on an unescaped semicolon wants a lookbehind, and
   * lookbehind was unsupported in Safari until 2023. A program meant to
   * still work in ten years should not depend on the newest syntax it
   * could have used.
   */
  function parseSemicolonFields(body) {
    var out = {};
    var parts = [];
    var current = "";
    for (var i = 0; i < body.length; i++) {
      var ch = body[i];
      if (ch === "\\" && i + 1 < body.length) {
        current += body[i + 1];
        i++;
      } else if (ch === ";") {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    parts.push(current);

    parts.forEach(function (part) {
      var at = part.indexOf(":");
      if (at < 0) return;
      out[part.slice(0, at).toUpperCase()] = part.slice(at + 1);
    });
    return out;
  }

  function inspectWifi(report, text) {
    report.type = "wifi";
    report.label = "Wi-Fi network";
    var f = parseSemicolonFields(text.slice(5));

    report.field("Network name", f.S);
    report.field("Security", f.T || "none stated");
    if (f.P) report.field("Password", f.P);
    if (f.H && /true/i.test(f.H)) report.field("Hidden network", "yes");

    report.add(WARNING, "WIFI_JOIN", "Scanning this can join a network",
      "Accepting connects your device to \u201c" + (f.S || "an unnamed network")
      + "\u201d. Whoever runs it sees the traffic your device sends and can "
      + "redirect it.");

    if (!f.T || /^nopass$/i.test(f.T)) {
      report.add(WARNING, "WIFI_OPEN", "The network has no encryption",
        "Traffic on an open network can be read by anyone within range, not "
        + "only by whoever runs it.");
    }
    if (f.H && /true/i.test(f.H)) {
      report.add(NOTE, "WIFI_HIDDEN", "The network does not broadcast its name",
        "Your device will then look for it everywhere you go, which lets "
        + "others recognise your device by the name it is calling for.");
    }
    return report;
  }

  function inspectOtp(report, text) {
    report.type = "otp";
    report.label = "Two-factor authentication secret";
    report.add(CRITICAL, "OTP_SECRET", "This is a secret, not a link",
      "It sets up two-factor authentication. Anyone who obtains it can "
      + "generate valid codes for that account indefinitely. Do not "
      + "photograph it, screenshot it, or send it anywhere.");
    try {
      var u = new URL(text);
      report.field("Account", decodeURIComponent(u.pathname.replace(/^\//, "")));
      var issuer = u.searchParams.get("issuer");
      if (issuer) report.field("Issuer", issuer);
      report.field("Secret", "present, not shown");
    } catch (err) {
      report.field("Content", "unreadable");
    }
    return report;
  }

  function inspectContact(report, text) {
    report.type = "contact";
    report.label = "Contact card";
    var urls = text.match(/https?:\/\/[^\s;,]+/gi) || [];
    var name = text.match(/(?:^|\n)(?:FN|N):([^\n;]+)/i);
    if (name) report.field("Name", name[1].trim());
    var tel = text.match(/TEL[^:]*:([^\n;]+)/i);
    if (tel) report.field("Telephone", tel[1].trim());
    var mail = text.match(/EMAIL[^:]*:([^\n;]+)/i);
    if (mail) report.field("Email", mail[1].trim());
    urls.forEach(function (u) { report.field("Address inside the card", u); });
    if (urls.length) {
      report.add(NOTE, "CONTACT_URL", "The card carries a web address",
        "Inspect it separately before opening it. A contact card is a "
        + "convenient wrapper for a link nobody looks at.");
    }
    return report;
  }

  function inspectSms(report, text) {
    report.type = "sms";
    report.label = "Pre-written text message";
    var rest = text.replace(/^smsto:/i, "").replace(/^sms:/i, "");
    var parts = rest.split(":");
    report.field("To", parts[0]);
    if (parts.length > 1) report.field("Message", parts.slice(1).join(":"));
    report.add(WARNING, "SMS_PREFILLED", "This prepares a message to send",
      "Accepting opens your messaging app with the recipient and text "
      + "already filled in. Sending it can subscribe you to a paid service "
      + "or confirm to a stranger that your number is live.");
    return report;
  }

  function inspectTel(report, text) {
    report.type = "tel";
    report.label = "Telephone number";
    report.field("Number", text.replace(/^tel:/i, ""));
    report.add(NOTE, "TEL_DIAL", "This prepares a call",
      "Check the number before dialling. Premium-rate lines are charged by "
      + "the minute and look like ordinary numbers.");
    return report;
  }

  function inspectMailto(report, text) {
    report.type = "mailto";
    report.label = "Email";
    try {
      var u = new URL(text);
      report.field("To", decodeURIComponent(u.pathname));
      var subject = u.searchParams.get("subject");
      var body = u.searchParams.get("body");
      if (subject) report.field("Subject", subject);
      if (body) report.field("Body", body);
    } catch (err) {
      report.field("Content", text);
    }
    return report;
  }

  function inspectGeo(report, text) {
    report.type = "geo";
    report.label = "Map location";
    report.field("Coordinates", text.replace(/^geo:/i, ""));
    return report;
  }

  function inspectCalendar(report, text) {
    report.type = "calendar";
    report.label = "Calendar event";
    var summary = text.match(/SUMMARY:([^\n\r]+)/i);
    var start = text.match(/DTSTART[^:]*:([^\n\r]+)/i);
    if (summary) report.field("Event", summary[1].trim());
    if (start) report.field("Starts", start[1].trim());
    var url = text.match(/https?:\/\/[^\s]+/i);
    if (url) {
      report.field("Address inside the event", url[0]);
      report.add(NOTE, "CALENDAR_URL", "The event carries a web address",
        "Inspect it separately before opening it.");
    }
    return report;
  }

  function inspectCrypto(report, text) {
    report.type = "payment";
    report.label = "Payment request";
    report.field("Request", text);
    report.add(WARNING, "PAYMENT", "This is a request for money",
      "The destination address cannot be checked by eye and a transfer "
      + "cannot be reversed. Confirm the address through a second channel "
      + "before sending anything.");
    return report;
  }

  /* ---------------------------------------------------------------------
   * Entry point
   * ------------------------------------------------------------------- */

  function inspect(text) {
    var report = new Report(text);

    if (typeof text !== "string" || !text.length) {
      report.add(NOTE, "EMPTY", "Nothing to inspect", "The code is empty.");
      return report;
    }

    var trimmed = text.trim();
    var lower = trimmed.toLowerCase();

    if (lower.indexOf("wifi:") === 0) return inspectWifi(report, trimmed);
    if (lower.indexOf("otpauth://") === 0) return inspectOtp(report, trimmed);
    if (lower.indexOf("begin:vcard") === 0 || lower.indexOf("mecard:") === 0) {
      return inspectContact(report, trimmed);
    }
    if (lower.indexOf("begin:vcalendar") === 0
        || lower.indexOf("begin:vevent") === 0) {
      return inspectCalendar(report, trimmed);
    }
    if (lower.indexOf("smsto:") === 0 || lower.indexOf("sms:") === 0) {
      return inspectSms(report, trimmed);
    }
    if (lower.indexOf("tel:") === 0) return inspectTel(report, trimmed);
    if (lower.indexOf("mailto:") === 0) return inspectMailto(report, trimmed);
    if (lower.indexOf("geo:") === 0) return inspectGeo(report, trimmed);
    if (/^(bitcoin|ethereum|litecoin|upi|lightning):/i.test(trimmed)) {
      return inspectCrypto(report, trimmed);
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return inspectURL(report, trimmed, true);
    }
    if (looksLikeBareDomain(trimmed)) {
      var out = inspectURL(report, trimmed, false);
      out.add(NOTE, "NO_SCHEME", "The address has no scheme",
        "It gives a host but does not say http or https, so whatever opens "
        + "it will choose, and the usual choice is the unencrypted one.");
      return out;
    }

    report.field("Text", trimmed);
    checkHiddenCharacters(report, trimmed, "text");
    return report;
  }

  root.ALEXANDRIA = root.ALEXANDRIA || {};
  root.ALEXANDRIA.inspect = inspect;
  root.ALEXANDRIA.levels = { CRITICAL: CRITICAL, WARNING: WARNING, NOTE: NOTE };
  root.ALEXANDRIA.reference = {
    shorteners: SHORTENERS,
    cheapTlds: CHEAP_TLDS,
    confusables: CONFUSABLE,
    scriptOf: scriptOf,
    scriptsIn: scriptsIn
  };
})(typeof window !== "undefined" ? window : this);
