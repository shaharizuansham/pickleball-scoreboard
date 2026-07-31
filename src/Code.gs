/**
 * Pickleball Scoreboard — server-side Apps Script.
 * Doubles, traditional side-out scoring. State for the single live match
 * lives in Script Properties; completed games are logged to the
 * "MatchHistory" sheet of the container spreadsheet.
 */

var STATE_KEY = 'PICKLEBALL_MATCH_STATE';
var HISTORY_SHEET_NAME = 'MatchHistory';
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
 * bestOf: 1|3|5, winScore: 11|15|21.
 */
function startMatch(team1, team2, bestOf, winScore) {
  var state = {
    team1: { name: team1.name || 'Team A', players: [team1.players[0] || 'Player 1', team1.players[1] || 'Player 2'] },
    team2: { name: team2.name || 'Team B', players: [team2.players[0] || 'Player 1', team2.players[1] || 'Player 2'] },
    bestOf: Number(bestOf) || 3,
    winScore: Number(winScore) || 11,
    winBy: 2,
    games: [],
    current: freshGame_(1),
    history: [],
    matchWinner: null
  };
  saveState_(state);
  return state;
}

function freshGame_(servingTeam) {
  return {
    team1Score: 0,
    team2Score: 0,
    servingTeam: servingTeam,
    serverNumber: 2, // only one server before the first side-out of a game
    firstServiceOfGame: true
  };
}

/**
 * Operator taps which side won the rally: 'team1' or 'team2'.
 * Applies side-out scoring rules and returns the updated state.
 */
function awardRally(side) {
  var state = getState();
  if (!state || state.matchWinner) return state;

  pushUndoSnapshot_(state);

  var cur = state.current;
  var winningTeam = side === 'team1' ? 1 : 2;

  if (winningTeam === cur.servingTeam) {
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
      state.matchWinner = team1Wins >= gamesToWin ? 1 : 2;
    } else {
      // Loser of the game serves first in the next game.
      state.current = freshGame_(winner === 1 ? 2 : 1);
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
