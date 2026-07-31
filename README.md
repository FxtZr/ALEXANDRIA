# ALEXANDRIA

**Read a code before you act on it.**

A QR code is a picture of a string. Every scanner turns it back into that
string and then immediately does whatever it says: opens the page, joins
the network, dials the number. This one stops after the first step and
shows you what it found.

Open `index.html` in a browser. That is the whole installation. No server,
no build step, no accounts, no network.

The name is not decoration. The library at Alexandria had the scrolls of
every ship entering the port seized, examined and copied before they were
returned. That is the entire design of this program.

---

## What it tells you

**Exactly what the code says**, as text you can read, never as a link.

**What kind of thing it is** — a web address, a Wi-Fi network, a contact
card, a pre-written text message, a payment request, a two-factor
authentication secret, a calendar event, or just words.

**What is worth pausing over.** Among the things it looks for:

- **A host that is not the alphabet it appears to be.** `аррӏе.com` written
  entirely in Cyrillic renders identically to the Latin word and resolves
  somewhere else entirely. The program decodes the punycode, identifies the
  writing system of every character, and tells you what the name actually
  reads as.
- **A host mixing writing systems**, which is the same attack done with a
  single substituted letter.
- **Characters that occupy no space or reverse reading order.** A
  right-to-left override turns `gnp.exe` into something that looks like a
  picture file. There is no legitimate reason for either in an address.
- **Credentials before an @ sign.** In `https://apple.com@evil.tk`,
  everything before the @ is discarded and the browser goes to `evil.tk`.
  This trick is decades old and still works because it is invisible unless
  you know to look.
- **A familiar name pushed into a subdomain**, as in
  `paypal.com.secure-login.tk`, where the real site is the last two parts
  and everything before them was chosen by whoever owns it.
- **Punycode used to encode plain ASCII**, which has no legitimate purpose
  and exists only to make a host harder to read.
- **Schemes that are not pages** — `javascript:` and `data:` carry code and
  documents, not destinations.
- **Weaker signals, reported as weak**: no encryption, a link shortener, a
  numeric host, an unusual port, heavy percent-encoding, an address carried
  inside another address, a registry where domains cost nothing.

For payloads that are not links it says what accepting would do: joining a
network hands your traffic to whoever runs it; a two-factor secret is a
secret and should not be photographed; a pre-written message can subscribe
you to something.

---

## What it does not do

**There is no button that opens anything.** This is the central decision
and it is not an oversight. The program exists so a code can be read
without being acted on, and a button beside the result reads as the thing
to do next. It would be pressed. You can copy the text instead and paste it
wherever you decide, deliberately, in a second step.

**It never says a code is safe.** It reports what it found. An empty list
means nothing matched a fixed set of known tricks, which is a much weaker
claim than safe, and the interface says so rather than letting silence be
read as approval.

**It does not follow shorteners.** Resolving `bit.ly/abc` means asking
bit.ly, which tells them you are interested and tells whoever made the link
that the code was scanned. The program says the destination is hidden and
leaves it hidden.

**It does not know about brands.** It has no list of banks or shops, so it
cannot tell you that a domain is imitating a particular company. It can
tell you the name is not written in the alphabet it appears to be, which is
the part software can establish without guessing.

**The camera is secondary.** Reading a picture needs no permission and
works everywhere. A live camera needs a permission prompt and a context the
browser trusts, which a file opened by double-click sometimes is and
sometimes is not. If the camera is unavailable the program says so and the
picture path still works.

---

## Repository layout

```
index.html            open this
css/tokens.css        design tokens, shared with sibling projects
css/alexandria.css    layout specific to this program
js/punycode.js        RFC 3492 decoding, no dependencies
js/inspect.js         the analysis engine, no DOM
js/scan.js            picture, clipboard, drag and drop, camera
js/app.js             the interface
tests/                run with node, no dependencies
assets/vendor/        jsQR, vendored with its licence
assets/fonts/         IBM Plex Mono, vendored with its licence
```

`js/inspect.js` touches no DOM, opens nothing and reaches no network. That
is enforced by what is in the file rather than by intention: an engine that
cannot act cannot be made to act by a payload.

---

## Running the tests

```
node tests/inspect.test.js
```

No framework and no dependencies.

Two things are checked for every case: that the expected findings appear,
and that nothing unexpected does. The second matters as much as the first.
Genuine internationalised domains — `bücher.de`, Japanese and Arabic names
— must produce no findings at all, because false alarms are what teach
people to stop reading warnings.

The punycode decoder is checked against several hundred cases generated
from Python's reference codec, covering Cyrillic, Greek, Hebrew, Arabic,
CJK and emoji.

---

## Extending

**Adding a check** means one function in `js/inspect.js` that calls
`report.add(level, code, title, detail)`, and at least two test cases: one
that must trigger it and one closely related case that must not.

Pick the level honestly. `critical` is for something with no legitimate
explanation — invisible characters, a reversed-reading-order override, a
scheme that executes code. `warning` is for something that is often
innocent and sometimes not. `note` is for context. Inflating a level to be
noticed is the fastest way to make the whole list ignorable.

Write the detail for someone who does not already know the attack. "Mixed
script detected" tells a reader nothing. Say what the consequence is.

**Do not add a list of brand names.** It would be permanently incomplete,
it would produce confident false negatives for every company not on it, and
maintaining it is a full-time job someone else is already doing badly.

---

## Contact

- Site — <https://FxtZr.com/>
- GitHub — <https://github.com/FxtZr/>
- YouTube — <https://www.youtube.com/@Fxtzr>
- X — <https://x.com/Fxt_Zr>

Reports of a code this program reads wrongly are the most useful kind of
issue. Include the exact string and what you expected.

---

## Licence

MIT, see `LICENSE`.

Bundled third-party components keep their own licences:

- **jsQR** — Apache 2.0, `assets/vendor/jsQR-LICENSE.txt`
- **IBM Plex Mono** — SIL Open Font Licence 1.1, `assets/fonts/OFL.txt`

This program is a reading aid. It cannot establish that anything is safe,
and it is not a substitute for care.
