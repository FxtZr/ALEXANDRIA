# Contributing

Corrections come first. If this program reads a code wrongly — flags
something harmless, or stays quiet about something it should have caught —
that is the most serious kind of bug it can have.

## Before anything else

```
node tests/inspect.test.js
```

Must pass. Exits non-zero on failure.

## Adding a check

One function in `js/inspect.js` calling
`report.add(level, code, title, detail)`, plus **two** test cases: one that
must trigger it, and one closely related case that must not. The second is
not optional. A check without a negative case is a check nobody has
established the boundaries of.

### Choosing the level

- `critical` — no legitimate explanation exists. Invisible characters in a
  host, a reading-order override, a scheme that runs code.
- `warning` — often innocent, sometimes not. An unencrypted address, a
  shortener, a numeric host.
- `note` — context, not concern. An unusual port, a cheap registry.

Do not inflate a level to make it noticed. A list where everything is
serious is a list where nothing is, and the people who need this program
most are the ones who will stop reading it first.

### Writing the detail

For someone who has never heard of the attack. "Mixed script detected"
tells a reader nothing they can act on. Say what actually happens:

> The label reads as "apple" but every letter in it is Cyrillic, not Latin.
> It resolves to a completely different site from the one it resembles.

Two or three sentences. Say the consequence, not the mechanism.

## What not to add

**A list of brand names.** It would be permanently incomplete, it would
produce confident silence for every company not on it, and it invites the
reader to trust an absence.

**Anything that reaches the network.** Not to resolve a shortener, not to
check a reputation service, not to fetch an update. The program's whole
claim is that nothing leaves the page, and one exception makes the claim
false. `js/inspect.js` in particular must stay incapable of acting: an
engine that cannot open anything cannot be tricked into opening something.

**A button that opens the payload.** See the README. It would be pressed.

## Style

Plain scripts, no modules, no build step, no framework. Modules and
`fetch()` are blocked under `file://`, and the program must open by
double-clicking `index.html`.

Avoid syntax newer than it needs to be. A regular-expression lookbehind was
removed during development because Safari did not support it until 2023,
and a tool meant to still work in ten years should not depend on the newest
thing available.

No `localStorage`, no cookies, no analytics.

Colours and type sizes live in `css/tokens.css` and nowhere else.

Comments explain why, not what. The most useful comment in the file records
why an obvious-looking approach was rejected.
