# Nescaxcle

Wordle for NESCAC cross country. Guess the day's mystery runner in 8 tries. There are men's, women's and combined pools, and each has its own daily runner.

## How it plays

Each guess shows eight tiles:

| Tile | Green | Yellow | Arrow |
|---|---|---|---|
| College | same school | – | – |
| State (home state, from high school) | same | – | – |
| Year | same | one class away | ↑ older / ↓ younger |
| XC PR (8K men, 6K women) | same | within 20s / 15s | ↑ slower / ↓ faster |
| Speed Rtg (racecast.co 2026 XC rating) | same | within 1.5 | ↑ higher / ↓ lower |
| 5K / Mile / 800 PR | same | within 10s / 3s / 1.5s | ↑ slower / ↓ faster |

Arrows point toward the mystery runner's value. PRs count college races only. `–` means no PR, and two `–` tiles count as a match. **Runners left** shows how many runners still fit every clue; tap it to see who they are.

The daily runner changes at midnight US Eastern time. Each pool is walked in a fixed shuffled order, so no runner repeats until the whole pool has been used.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # rules tests
npm run build    # static build in dist/ (deploy to Vercel as a Vite app)
```

## Updating the data

`src/data/runners.json` is built from racecast.co team and athlete pages:

```sh
RACECAST_AGENT=<X-Racecast-Agent header value> npm run scrape
```

The script reads the current roster of all 11 NESCAC teams, then each athlete page for home state, college PRs and the current XC speed rating. Pages are cached in `.cache/racecast/`; delete that folder to refetch. The header value is read from the environment and is never written to the repo.
