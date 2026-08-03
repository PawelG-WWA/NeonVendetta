import { Components, GameStates } from '../components.js';

export function createHudSystem(world, root) {
  let hudElement = null;
  let scoreElement = null;
  let killsElement = null;
  let lastVisible = null;
  let lastScore = -1;
  let lastKills = -1;

  function formatScore(value) {
    const clamped = Math.min(Math.max(value, 0), 999999);
    return String(clamped).padStart(6, '0');
  }

  function formatKills(value) {
    const clamped = Math.min(Math.max(value, 0), 999);
    return String(clamped).padStart(3, '0');
  }

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  function getScore() {
    const scoreId = world.queryFirst(Components.Score);
    return scoreId === undefined
      ? null
      : world.getComponent(scoreId, Components.Score);
  }

  function getKillStats() {
    const statsId = world.queryFirst(Components.KillStats);
    return statsId === undefined
      ? null
      : world.getComponent(statsId, Components.KillStats);
  }

  function buildDom() {
    hudElement = document.createElement('div');
    hudElement.className = 'hud';

    scoreElement = document.createElement('div');
    scoreElement.className = 'hud-score';
    scoreElement.textContent = 'SCORE 000000';

    killsElement = document.createElement('div');
    killsElement.className = 'hud-kills';
    killsElement.textContent = 'KILLS 000';

    hudElement.appendChild(scoreElement);
    hudElement.appendChild(killsElement);
    root.appendChild(hudElement);
  }

  function syncVisibility(visible) {
    hudElement.style.display = visible ? 'block' : 'none';
  }

  return {
    init() {
      buildDom();
      const gameState = getGameState();
      lastVisible = gameState !== null && gameState.current === GameStates.PLAYING;
      syncVisibility(lastVisible);
      const score = getScore();
      lastScore = score === null ? 0 : score.value;
      scoreElement.textContent = 'SCORE ' + formatScore(lastScore);
      const killStats = getKillStats();
      lastKills = killStats === null ? 0 : killStats.kills;
      killsElement.textContent = 'KILLS ' + formatKills(lastKills);
    },

    update() {
      const gameState = getGameState();
      const visible = gameState !== null && gameState.current === GameStates.PLAYING;
      if (visible !== lastVisible) {
        lastVisible = visible;
        syncVisibility(visible);
      }

      const score = getScore();
      const value = score === null ? 0 : score.value;
      if (value !== lastScore) {
        lastScore = value;
        scoreElement.textContent = 'SCORE ' + formatScore(value);
      }

      const killStats = getKillStats();
      const kills = killStats === null ? 0 : killStats.kills;
      if (kills !== lastKills) {
        lastKills = kills;
        killsElement.textContent = 'KILLS ' + formatKills(kills);
      }
    },

    dispose() {
      if (hudElement !== null && hudElement.parentNode) {
        hudElement.parentNode.removeChild(hudElement);
      }
      hudElement = null;
      scoreElement = null;
      killsElement = null;
      lastVisible = null;
      lastScore = -1;
      lastKills = -1;
    },
  };
}
