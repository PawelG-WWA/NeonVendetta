import { Components, GameStates } from '../components.js';
import { loadBestScore, saveBestScore } from '../../persistence.js';

export function createUISystem(world, root) {
  let menuElement = null;
  let startButton = null;
  let bestScoreElement = null;
  let playHintElement = null;
  let gameOverElement = null;
  let gameOverScoreElement = null;
  let gameOverBestElement = null;
  // Render cache: mirrors GameState.current / BestScore.value so DOM writes
  // only happen when the underlying component data actually changed.
  let lastState = null;
  let lastBestScore = -1;

  function formatScore(value) {
    const clamped = Math.min(Math.max(value, 0), 999999);
    return String(clamped).padStart(6, '0');
  }

  function getGameEntity() {
    return world.queryFirst(Components.GameState);
  }

  function onStartClick() {
    const gameId = getGameEntity();
    if (gameId === undefined) {
      return;
    }
    const gameState = world.getComponent(gameId, Components.GameState);
    gameState.request = GameStates.PLAYING;
  }

  function buildDom() {
    menuElement = document.createElement('div');
    menuElement.className = 'menu';

    const logo = document.createElement('img');
    logo.className = 'menu-logo';
    logo.src = 'assets/title_logo.png';
    logo.alt = 'NEON VENDETTA';
    logo.width = 600;
    logo.height = 225;

    startButton = document.createElement('button');
    startButton.className = 'start-button';
    startButton.type = 'button';
    startButton.textContent = 'START GAME';
    startButton.addEventListener('click', onStartClick);

    bestScoreElement = document.createElement('div');
    bestScoreElement.className = 'best-score';

    menuElement.appendChild(logo);
    menuElement.appendChild(startButton);
    menuElement.appendChild(bestScoreElement);

    playHintElement = document.createElement('div');
    playHintElement.className = 'play-hint';
    playHintElement.textContent = 'PRESS ESC TO RETURN TO MENU';
    playHintElement.style.display = 'none';

    gameOverElement = document.createElement('div');
    gameOverElement.className = 'game-over';

    const title = document.createElement('div');
    title.className = 'game-over-title';
    title.textContent = 'GAME OVER';

    gameOverScoreElement = document.createElement('div');
    gameOverScoreElement.className = 'game-over-score';

    gameOverBestElement = document.createElement('div');
    gameOverBestElement.className = 'game-over-best';

    const hint = document.createElement('div');
    hint.className = 'game-over-hint';
    hint.textContent = 'PRESS ENTER';

    gameOverElement.appendChild(title);
    gameOverElement.appendChild(gameOverScoreElement);
    gameOverElement.appendChild(gameOverBestElement);
    gameOverElement.appendChild(hint);
    gameOverElement.style.display = 'none';

    root.appendChild(menuElement);
    root.appendChild(playHintElement);
    root.appendChild(gameOverElement);
  }

  function syncVisibility(state) {
    const inMenu = state === GameStates.MENU;
    menuElement.style.display = inMenu ? 'flex' : 'none';
    playHintElement.style.display = state === GameStates.PLAYING ? 'block' : 'none';
    gameOverElement.style.display = state === GameStates.GAME_OVER ? 'flex' : 'none';
  }

  function onEnterGameOver(gameId) {
    const score = world.getComponent(gameId, Components.Score);
    const bestScore = world.getComponent(gameId, Components.BestScore);
    const value = score === undefined ? 0 : score.value;
    if (bestScore !== undefined && value > bestScore.value) {
      bestScore.value = value;
      saveBestScore(value);
    }
    gameOverScoreElement.textContent = 'SCORE ' + formatScore(value);
    gameOverBestElement.textContent =
      'BEST SCORE ' + formatScore(bestScore === undefined ? 0 : bestScore.value);
  }

  return {
    init() {
      const gameId = getGameEntity();
      if (gameId !== undefined && world.hasComponent(gameId, Components.BestScore)) {
        world.getComponent(gameId, Components.BestScore).value = loadBestScore();
      }
      buildDom();
      if (gameId !== undefined) {
        lastState = world.getComponent(gameId, Components.GameState).current;
      } else {
        lastState = GameStates.MENU;
      }
      syncVisibility(lastState);
    },

    update() {
      const gameId = getGameEntity();
      if (gameId === undefined) {
        return;
      }
      const gameState = world.getComponent(gameId, Components.GameState);
      if (gameState.current !== lastState) {
        const previous = lastState;
        lastState = gameState.current;
        if (lastState === GameStates.GAME_OVER && previous !== null) {
          onEnterGameOver(gameId);
        }
        syncVisibility(lastState);
      }
      const bestScore = world.getComponent(gameId, Components.BestScore);
      if (bestScore && bestScore.value !== lastBestScore) {
        lastBestScore = bestScore.value;
        bestScoreElement.textContent = 'BEST SCORE ' + formatScore(bestScore.value);
      }
    },

    dispose() {
      if (startButton) {
        startButton.removeEventListener('click', onStartClick);
      }
      if (menuElement && menuElement.parentNode) {
        menuElement.parentNode.removeChild(menuElement);
      }
      if (playHintElement && playHintElement.parentNode) {
        playHintElement.parentNode.removeChild(playHintElement);
      }
      if (gameOverElement && gameOverElement.parentNode) {
        gameOverElement.parentNode.removeChild(gameOverElement);
      }
      menuElement = null;
      startButton = null;
      bestScoreElement = null;
      playHintElement = null;
      gameOverElement = null;
      gameOverScoreElement = null;
      gameOverBestElement = null;
      lastState = null;
      lastBestScore = -1;
    },
  };
}
