/* ALEXANDRIA -- punycode decoding.
 *
 * An internationalised domain is stored as ASCII beginning xn--, and shown
 * to the reader as the characters it encodes. Both forms have to be
 * visible: the ASCII is what the machine resolves, the decoded form is
 * what a person sees in the address bar, and an attack lives in the gap
 * between them.
 *
 * RFC 3492. The algorithm is transcribed from the specification rather
 * than adapted from another implementation, and the test suite checks it
 * against Python's reference codec on several hundred generated cases.
 *
 * Only decoding is implemented. This program never needs to produce a
 * punycode label, only to read one.
 */
(function (root) {
  "use strict";

  var BASE = 36;
  var TMIN = 1;
  var TMAX = 26;
  var SKEW = 38;
  var DAMP = 700;
  var INITIAL_BIAS = 72;
  var INITIAL_N = 128;
  var DELIMITER = "-";
  var PREFIX = "xn--";
  var MAX_INT = 0x7fffffff;

  function DecodeError(reason) {
    this.name = "DecodeError";
    this.message = reason;
  }
  DecodeError.prototype = Object.create(Error.prototype);

  /* Digit values run 0-25 for a-z then 26-35 for 0-9, case-insensitively. */
  function digitValue(code) {
    if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;   // 0-9
    if (code >= 0x41 && code <= 0x5a) return code - 0x41;        // A-Z
    if (code >= 0x61 && code <= 0x7a) return code - 0x61;        // a-z
    return BASE;                                                 // invalid
  }

  function adapt(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    var k = 0;
    while (delta > ((BASE - TMIN) * TMAX) >> 1) {
      delta = Math.floor(delta / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
  }

  /* Decode one label, without the xn-- prefix. */
  function decode(input) {
    if (typeof input !== "string") throw new DecodeError("not a string");

    var output = [];
    var basic = input.lastIndexOf(DELIMITER);

    if (basic > 0) {
      for (var j = 0; j < basic; j++) {
        var code = input.charCodeAt(j);
        if (code >= 0x80) throw new DecodeError("non-ASCII in the basic part");
        output.push(code);
      }
    }

    var n = INITIAL_N;
    var i = 0;
    var bias = INITIAL_BIAS;
    var index = basic > 0 ? basic + 1 : 0;

    while (index < input.length) {
      var oldi = i;
      var w = 1;

      for (var k = BASE; ; k += BASE) {
        if (index >= input.length) throw new DecodeError("truncated");
        var digit = digitValue(input.charCodeAt(index++));
        if (digit >= BASE) throw new DecodeError("invalid digit");
        if (digit > Math.floor((MAX_INT - i) / w)) {
          throw new DecodeError("overflow");
        }
        i += digit * w;

        var t = k <= bias ? TMIN
              : (k >= bias + TMAX ? TMAX : k - bias);
        if (digit < t) break;

        if (w > Math.floor(MAX_INT / (BASE - t))) {
          throw new DecodeError("overflow");
        }
        w *= BASE - t;
      }

      var out = output.length + 1;
      bias = adapt(i - oldi, out, oldi === 0);

      if (Math.floor(i / out) > MAX_INT - n) throw new DecodeError("overflow");
      n += Math.floor(i / out);
      i %= out;

      output.splice(i, 0, n);
      i++;
    }

    var result = "";
    for (var p = 0; p < output.length; p++) {
      result += String.fromCodePoint(output[p]);
    }
    return result;
  }

  /* Decode a whole domain. Labels without the prefix pass through
   * untouched; a label that carries the prefix but will not decode is
   * returned as it was, and reported, because a malformed label is itself
   * worth knowing about. */
  function toUnicode(domain) {
    if (typeof domain !== "string" || !domain) {
      return { text: domain, decoded: false, labels: [], malformed: false };
    }

    var malformed = false;
    var anyDecoded = false;
    var labels = domain.split(".").map(function (label) {
      var lower = label.toLowerCase();
      if (lower.indexOf(PREFIX) !== 0) {
        return { raw: label, text: label, decoded: false };
      }
      try {
        var text = decode(label.slice(PREFIX.length));
        anyDecoded = true;
        return { raw: label, text: text, decoded: true };
      } catch (err) {
        malformed = true;
        return { raw: label, text: label, decoded: false, error: err.message };
      }
    });

    return {
      text: labels.map(function (l) { return l.text; }).join("."),
      decoded: anyDecoded,
      malformed: malformed,
      labels: labels
    };
  }

  root.ALEXANDRIA = root.ALEXANDRIA || {};
  root.ALEXANDRIA.punycode = {
    decode: decode,
    toUnicode: toUnicode,
    DecodeError: DecodeError,
    PREFIX: PREFIX
  };
})(typeof window !== "undefined" ? window : this);
