# Pickleball Scoreboard

A courtside digital scoreboard for **doubles pickleball**, built entirely on
**Google Apps Script + Google Sheets**. No external hosting, no database —
the Apps Script Web App *is* the scoreboard UI, and the container Google
Sheet logs every completed game to a `MatchHistory` tab and every completed
match (with start/end time and total duration) to a `Matches` tab.
Fully responsive — on a narrow phone screen the two-team score view stacks
vertically instead of squeezing side-by-side, and every button keeps a
finger-sized touch target. "Stadium broadcast" visual style — chunky
display type, tabular-mono score digits, floodlight-glow dark theme by
default with a warm light theme behind a toggle switch (top-right of the
tab bar), remembered per-browser via `localStorage`.

## How scoring works

Two selectable scoring modes, picked per match on the setup screen:

**Side-out (traditional, default)**
- Only the serving team can score a point.
- Each doubles team gets **two servers** per turn, except the very first
  service of each game (only one server before the first side-out —
  the classic "0-0-2" start).
- The operator just taps **which side won each rally** — the app works out
  serve rotation and side-outs for you.

**Rally (badminton-style)**
- Every rally scores a point for whoever wins it, regardless of who served.
- The winner of each rally serves next.
- This is the same scoring style badminton uses, and matches pickleball's
  provisional 2026 rally-scoring format.

Both modes share:
- Games played to 11/15/21, win by 2. Either side can win the
  game-winning point (2026 rule).
- Match is best of 1, 3, or 5 games; the loser of a game serves first in
  the next game.

## Files

```
src/
├── appsscript.json   — Apps Script manifest (web app config)
├── Code.gs            — server-side match engine + Sheet logging
├── Scoreboard.html    — page markup (Scoreboard / History / About tabs)
├── CourtDiagram.html  — inline SVG court layout, shown on the About tab
├── Stylesheet.html    — dark, high-contrast scoreboard theme
└── JavaScript.html    — client-side controller
```

## Setup

1. Go to [sheets.google.com](https://sheets.google.com) and create a new
   blank spreadsheet (e.g. "Pickleball Scoreboard"). This spreadsheet is
   where completed games get logged.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the default `Code.gs` content, then create each file listed
   above (matching names, `.gs` for Code.gs, `.html` for the rest) and
   paste in the contents from this repo's `src/` folder.

   *Alternative:* if you have [`clasp`](https://github.com/google/clasp)
   installed and are logged in (`clasp login`), copy
   `.clasp.json.example` to `.clasp.json`, fill in the `scriptId` of the
   Apps Script project (Project Settings → Script ID), then run
   `clasp push` from the repo root.
4. Back in the Apps Script editor, click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or "Anyone with the link", or restrict to
     your Google Workspace domain if preferred)
5. Click **Deploy**, authorize the app when prompted, and copy the Web
   App URL.
6. Open that URL on the tablet/TV/laptop you'll use courtside — or use
   the short link below.

### Short link (GitHub Pages)

[`shaharizuansham.github.io/pickleball-scoreboard`](https://shaharizuansham.github.io/pickleball-scoreboard)
redirects straight to the Apps Script Web App URL above (see
`index.html`). It's just a forwarding page — you'll still need to sign
in with a Google account that has access to the deployment.

If the Apps Script deployment URL ever changes (e.g. redeployed under a
different account), update the URL in `index.html` (both the
`<meta http-equiv="refresh">` tag and the `window.location.replace(...)`
call) and push.

To enable GitHub Pages on this repo (one-time, done via the GitHub web
UI): **Settings → Pages → Source: Deploy from a branch → Branch: `main`
/ `(root)` → Save**.

## Using it

The app has three tabs: **Scoreboard**, **History**, and **About & Rules**.

### Scoreboard tab
1. Enter both teams' names and player names, pick best-of, win score, and
   **scoring style** (side-out or rally), tap **Start Match**.
2. Tap **+1** on whichever side wins a rally. The score, serve dot, and
   "Serving: [name]" label update automatically. In side-out mode, score is
   shown as `points` for the receiving side and `points-server#` for the
   serving side (e.g. "2-2" = 2 points, server #2); in rally mode it's just
   the point totals.
3. **−** (or the **Undo** button) reverts the last point awarded, or the
   last game completion.
4. **🎾 Set as server** under each side manually corrects who's serving,
   without changing any score — for fixing a scorekeeper mistake mid-game.
   It's disabled for whichever side is already marked as serving.
4. A live **match timer** runs from the moment you tap Start Match, and
   freezes ("final") once the match ends.
5. A running list of completed games for the current match is shown below
   the score.
6. When a game ends, tap **Start Next Game** to continue the match.
7. **End Match** finishes the match early — winner is whichever side has
   won more games (ties are broken by the current game's score, if any
   points were played; if everything is still tied it won't auto-resolve).
   Ending the match stamps the end time and logs total duration.
8. **Reset Match** clears the board to start over.

### History tab
Two tables, both pulled live from the spreadsheet:
- **Matches** — one row per completed match: start time, end time, total
  duration, teams, games won, winner, scoring mode used.
- **Games** — every individual completed game: date, teams, game number,
  score, winner.

Tap **Refresh** to pull the latest.

### About & Rules tab
A quick-reference page covering what pickleball is, an SVG court layout
(net, non-volley zone/kitchen, service courts, baselines), key rules, and
a short glossary — handy for anyone new to the sport who's helping keep
score.

## Notes

- The board holds **one live match at a time** (state is stored in Script
  Properties). Reset the match before starting a new one.
- This is a container-bound script, so all edits happen inside the Apps
  Script editor tied to the spreadsheet (or via `clasp push` against that
  same script ID).
