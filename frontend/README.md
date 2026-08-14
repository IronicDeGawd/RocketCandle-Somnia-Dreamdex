
## Tests

```
npm test
```

**Needs Node 22 or newer.** The tests are TypeScript run through Node's own
type stripping, which Node 20 rejects outright with `bad option:
--experimental-strip-types`. The deploy box currently runs Node 20 and only
builds and serves, so this affects development machines and any future CI, not
production.

Node's own test runner, so there is nothing extra to install. Covers the
arithmetic that moves money: raw-amount conversion, tick and lot alignment,
order expiry, the round-trip cost estimate and the stop-loss floor predicate,
plus the practice-run level cap.

These exist because every failure in that code is silent - an order that mines,
spends gas and does nothing, or a cost quoted at half what it charges. A green
build has never once caught one.
