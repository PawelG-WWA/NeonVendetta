import { Components } from '../components.js';

export function createInputSystem(world, target = window) {
  const downQueue = [];
  const upQueue = [];

  function getInput() {
    const id = world.queryFirst(Components.InputState);
    return id === undefined ? null : world.getComponent(id, Components.InputState);
  }

  function onKeyDown(event) {
    if (!event.repeat) {
      downQueue.push(event.code);
    }
  }

  function onKeyUp(event) {
    upQueue.push(event.code);
  }

  function onBlur() {
    const input = getInput();
    if (input) {
      input.pressed.clear();
      input.justPressed.clear();
      input.justReleased.clear();
    }
    downQueue.length = 0;
    upQueue.length = 0;
  }

  return {
    init() {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      target.addEventListener('blur', onBlur);
    },

    update() {
      const input = getInput();
      if (!input) {
        downQueue.length = 0;
        upQueue.length = 0;
        return;
      }
      for (let i = 0; i < downQueue.length; i++) {
        const code = downQueue[i];
        input.pressed.add(code);
        input.justPressed.add(code);
      }
      for (let i = 0; i < upQueue.length; i++) {
        const code = upQueue[i];
        input.pressed.delete(code);
        input.justReleased.add(code);
      }
      downQueue.length = 0;
      upQueue.length = 0;
    },

    postUpdate() {
      const input = getInput();
      if (!input) {
        return;
      }
      input.justPressed.clear();
      input.justReleased.clear();
    },

    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      downQueue.length = 0;
      upQueue.length = 0;
    },
  };
}
