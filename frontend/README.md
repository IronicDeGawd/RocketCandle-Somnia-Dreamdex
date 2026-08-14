
## Tests

```
npm test
```

Node's own test runner, so there is nothing extra to install. Covers the
arithmetic that moves money: raw-amount conversion, tick and lot alignment,
order expiry, the round-trip cost estimate and the stop-loss floor predicate,
plus the practice-run level cap.

These exist because every failure in that code is silent - an order that mines,
spends gas and does nothing, or a cost quoted at half what it charges. A green
build has never once caught one.
