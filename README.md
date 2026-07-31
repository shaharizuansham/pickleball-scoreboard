# Pickleball Scoreboard

A courtside digital scoreboard for **doubles pickleball**, built entirely on
**Google Apps Script + Google Sheets**. No external hosting, no database —
the Apps Script Web App *is* the scoreboard UI, and the container Google
Sheet logs every completed game to a `MatchHistory` tab.

## How scoring works

Traditional side-out scoring (not rally scoring):

- Only the serving team can score a point.
- Each doubles team gets **two servers** per turn, except the very first
  service of each game (only one server before the first side-out —
  the classic "0-0-2" start).
- The operator just taps **which side won each rally** — the app works out
  serve rotation and side-outs for you.
- Games are played to 11/15/21, win by 2. Either side can win the
  game-winning point (2026 rule).
- Match is best of 1, 3, or 5 games; the loser of a game serves first in
  the next game.

## Files

```
src/
├── appsscript.json   — Apps Script manifest (web app config)
├── Code.gs            — server-side match engine + Sheet logging
├── Scoreboard.html    — page markup
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
6. Open that URL on the tablet/TV/laptop you'll use courtside.

## Using it

1. Enter both teams' names and player names, pick best-of and win score,
   tap **Start Match**.
2. Tap the **left or right half of the screen** whenever that side wins a
   rally. The score, server dot, and server number update automatically.
3. **Undo** reverts the last rally (or the last game completion).
4. When a game ends, tap **Start Next Game** to continue the match.
5. **Reset Match** clears the board to start over.
6. Check the `MatchHistory` tab in the spreadsheet for a log of every
   completed game (date, teams, per-game scores, winner).

## Notes

- The board holds **one live match at a time** (state is stored in Script
  Properties). Reset the match before starting a new one.
- This is a container-bound script, so all edits happen inside the Apps
  Script editor tied to the spreadsheet (or via `clasp push` against that
  same script ID).
