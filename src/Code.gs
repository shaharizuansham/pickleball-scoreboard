/**
 * Pickleball Scoreboard — server-side Apps Script.
 * Doubles, traditional side-out scoring. State for the single live match
 * lives in Script Properties; completed games are logged to the
 * "MatchHistory" sheet of the container spreadsheet.
 */

var STATE_KEY = 'PICKLEBALL_MATCH_STATE';
var HISTORY_SHEET_NAME = 'MatchHistory';
var MATCHES_SHEET_NAME = 'Matches';
var MAX_UNDO = 20;

function doGet(e) {
  return HtmlService.createTemplateFromFile('Scoreboard')
    .evaluate()
    .setTitle('Pickleball Scoreboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Returns the current match state, or null if no match has been started. */
function getState() {
  var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
}

function pushUndoSnapshot_(state) {
  var snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.history;
  state.history = state.history || [];
  state.history.push(snapshot);
  if (state.history.length > MAX_UNDO) state.history.shift();
}

/**
 * Starts a new match. teamX = { name, players: [p1, p2] }.
 * bestOf: 1|3|5, winScore: 11|15|21. firstServeTeam: 1|2 (who serves first, e.g. coin toss winner).
 * scoringMode: 'sideout' (traditional, default) | 'rally' (badminton-style — every rally scores).
 */
function startMatch(team1, team2, bestOf, winScore, firstServeTeam, scoringMode) {
  var mode = scoringMode === 'rally' ? 'rally' : 'sideout';
  var state = {
    team1: { name: team1.name || 'Team A', players: [team1.players[0] || 'Player 1', team1.players[1] || 'Player 2'] },
    team2: { name: team2.name || 'Team B', players: [team2.players[0] || 'Player 1', team2.players[1] || 'Player 2'] },
    bestOf: Number(bestOf) || 3,
    winScore: Number(winScore) || 11,
    winBy: 2,
    scoringMode: mode,
    games: [],
    current: freshGame_(Number(firstServeTeam) === 2 ? 2 : 1, mode),
    history: [],
    matchWinner: null,
    matchStartTime: Date.now(),
    matchEndTime: null,
    matchDurationMs: null
  };
  saveState_(state);
  return state;
}

function freshGame_(servingTeam, mode) {
  return {
    team1Score: 0,
    team2Score: 0,
    servingTeam: servingTeam,
    // In side-out mode, only one server before the first side-out of a game.
    // In rally mode there's no two-server rule, so this is always 1.
    serverNumber: mode === 'rally' ? 1 : 2,
    firstServiceOfGame: true
  };
}

/**
 * Operator taps which side won the rally: 'team1' or 'team2'.
 * Applies the match's scoring rules (side-out or rally) and returns the updated state.
 */
function awardRally(side) {
  var state = getState();
  if (!state || state.matchWinner) return state;

  pushUndoSnapshot_(state);

  var cur = state.current;
  var winningTeam = side === 'team1' ? 1 : 2;

  if (state.scoringMode === 'rally') {
    if (winningTeam === 1) cur.team1Score++; else cur.team2Score++;
    cur.servingTeam = winningTeam; // winner serves next, badminton-style
    cur.serverNumber = 1;
  } else if (winningTeam === cur.servingTeam) {
    if (cur.servingTeam === 1) cur.team1Score++; else cur.team2Score++;
  } else if (cur.serverNumber === 1 && !cur.firstServiceOfGame) {
    cur.serverNumber = 2;
  } else {
    cur.servingTeam = winningTeam;
    cur.serverNumber = 1;
    cur.firstServiceOfGame = false;
  }

  var winner = checkGameWinner_(cur, state.winScore, state.winBy);
  if (winner) {
    state.games.push({ team1Score: cur.team1Score, team2Score: cur.team2Score, winner: winner });
    logGameToSheet_(state, state.games.length, cur, winner);

    var gamesToWin = Math.ceil(state.bestOf / 2);
    var team1Wins = state.games.filter(function (g) { return g.winner === 1; }).length;
    var team2Wins = state.games.filter(function (g) { return g.winner === 2; }).length;

    if (team1Wins >= gamesToWin || team2Wins >= gamesToWin) {
      finalizeMatchWin_(state, team1Wins >= gamesToWin ? 1 : 2);
    } else {
      // Loser of the game serves first in the next game.
      state.current = freshGame_(winner === 1 ? 2 : 1, state.scoringMode);
    }
  }

  saveState_(state);
  return state;
}

function checkGameWinner_(cur, winScore, winBy) {
  if (cur.team1Score >= winScore && cur.team1Score - cur.team2Score >= winBy) return 1;
  if (cur.team2Score >= winScore && cur.team2Score - cur.team1Score >= winBy) return 2;
  return null;
}

/**
 * Manually corrects which team is serving, without changing any score.
 * For fixing a scorekeeper mistake mid-game — not part of normal play.
 */
function setServingTeam(teamNum) {
  var state = getState();
  if (!state || state.matchWinner) return state;

  pushUndoSnapshot_(state);

  var cur = state.current;
  cur.servingTeam = Number(teamNum) === 2 ? 2 : 1;
  cur.serverNumber = 1;

  saveState_(state);
  return state;
}

/** Reverts the last awarded rally / game-completion. */
function undo() {
  var state = getState();
  if (!state || !state.history || state.history.length === 0) return state;
  var previous = state.history.pop();
  previous.history = state.history;
  saveState_(previous);
  return previous;
}

function resetMatch() {
  PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
  return null;
}

/**
 * Ends the match early. If the current game has points on the board with
 * a clear leader, it's logged as a final (possibly short) game first.
 * Winner is whichever side has won more games; if games are tied and the
 * current game is also tied, the match cannot be auto-resolved and the
 * state is left untouched (matchWinner stays null).
 */
function endMatch() {
  var state = getState();
  if (!state || state.matchWinner) return state;

  pushUndoSnapshot_(state);

  var cur = state.current;
  if (cur.team1Score > 0 || cur.team2Score > 0) {
    var gameWinner = cur.team1Score === cur.team2Score ? null : (cur.team1Score > cur.team2Score ? 1 : 2);
    if (gameWinner) {
      state.games.push({ team1Score: cur.team1Score, team2Score: cur.team2Score, winner: gameWinner });
      logGameToSheet_(state, state.games.length, cur, gameWinner);
    }
  }

  var team1Wins = state.games.filter(function (g) { return g.winner === 1; }).length;
  var team2Wins = state.games.filter(function (g) { return g.winner === 2; }).length;

  if (team1Wins === team2Wins) {
    state.history.pop(); // can't resolve a winner — cancel the snapshot, leave state as-is
    return state;
  }

  finalizeMatchWin_(state, team1Wins > team2Wins ? 1 : 2);
  return state;
}

/** Sets the match winner, stamps end time/duration, logs the match summary, and saves. */
function finalizeMatchWin_(state, winner) {
  state.matchWinner = winner;
  state.matchEndTime = Date.now();
  state.matchDurationMs = state.matchEndTime - state.matchStartTime;
  logMatchSummaryToSheet_(state);
  saveState_(state);
}

/** Returns all logged games from the MatchHistory sheet, most recent first. */
function getMatchHistory() {
  var sheet = ensureSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  return rows.map(function (r) {
    return {
      date: Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      team1: r[1],
      team2: r[2],
      gameNumber: r[3],
      team1Score: r[4],
      team2Score: r[5],
      winner: r[6]
    };
  }).reverse();
}

/** Returns all logged match summaries from the Matches sheet, most recent first. */
function getMatchSummaries() {
  var sheet = ensureMatchesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  return rows.map(function (r) {
    return {
      started: Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      ended: Utilities.formatDate(new Date(r[1]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      duration: r[2],
      team1: r[3],
      team2: r[4],
      gamesWon: r[5],
      winner: r[6],
      scoringMode: r[7]
    };
  }).reverse();
}

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HISTORY_SHEET_NAME);
    sheet.appendRow(['Date', 'Team1', 'Team2', 'Game #', 'Team1 Score', 'Team2 Score', 'Winner']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logGameToSheet_(state, gameNumber, cur, winner) {
  var sheet = ensureSheet_();
  var winnerName = winner === 1 ? state.team1.name : state.team2.name;
  sheet.appendRow([
    new Date(),
    state.team1.name,
    state.team2.name,
    gameNumber,
    cur.team1Score,
    cur.team2Score,
    winnerName
  ]);
}

function ensureMatchesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MATCHES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MATCHES_SHEET_NAME);
    sheet.appendRow(['Started', 'Ended', 'Duration', 'Team1', 'Team2', 'Games Won', 'Winner', 'Scoring Mode']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logMatchSummaryToSheet_(state) {
  var sheet = ensureMatchesSheet_();
  var winnerName = state.matchWinner === 1 ? state.team1.name : state.team2.name;
  var team1Wins = state.games.filter(function (g) { return g.winner === 1; }).length;
  var team2Wins = state.games.filter(function (g) { return g.winner === 2; }).length;
  sheet.appendRow([
    new Date(state.matchStartTime),
    new Date(state.matchEndTime),
    formatDuration_(state.matchDurationMs),
    state.team1.name,
    state.team2.name,
    team1Wins + '-' + team2Wins,
    winnerName,
    state.scoringMode === 'rally' ? 'Rally' : 'Side-out'
  ]);
}

function formatDuration_(ms) {
  var totalSec = Math.floor(ms / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return (h > 0 ? h + ':' + pad(m) : m) + ':' + pad(s);
}
