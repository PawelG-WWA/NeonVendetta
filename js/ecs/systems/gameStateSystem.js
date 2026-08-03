import { Components, GameStates } from '../components.js';

const TRANSITIONS = Object.freeze({
  [GameStates.MENU]: new Set([GameStates.PLAYING]),
  [GameStates.PLAYING]: new Set([GameStates.MENU, GameStates.GAME_OVER]),
  [GameStates.GAME_OVER]: new Set([GameStates.MENU]),
});

export function createGameStateSystem(world) {
  function apply(gameState, next) {
    if (!TRANSITIONS[gameState.current].has(next)) {
      return;
    }
    gameState.previous = gameState.current;
    gameState.current = next;
  }

  return {
    update() {
      const gameId = world.queryFirst(Components.GameState);
      if (gameId === undefined) {
        return;
      }
      const gameState = world.getComponent(gameId, Components.GameState);

      const inputId = world.queryFirst(Components.InputState);
      const input = inputId === undefined
        ? null
        : world.getComponent(inputId, Components.InputState);
      const justPressed = (code) => input !== null && input.justPressed.has(code);

      if (gameState.current === GameStates.MENU) {
        if (justPressed('Enter') || justPressed('NumpadEnter')) {
          apply(gameState, GameStates.PLAYING);
        }
      } else if (gameState.current === GameStates.PLAYING) {
        if (justPressed('Escape')) {
          apply(gameState, GameStates.MENU);
        }
      // Entered when damageSystem requests GAME_OVER after the player death
      // anim finishes — Enter dismisses the screen back to MENU.
      } else if (gameState.current === GameStates.GAME_OVER) {
        if (justPressed('Enter') || justPressed('NumpadEnter')) {
          apply(gameState, GameStates.MENU);
        }
      }

      if (gameState.request !== null) {
        apply(gameState, gameState.request);
        gameState.request = null;
      }
    },
  };
}
