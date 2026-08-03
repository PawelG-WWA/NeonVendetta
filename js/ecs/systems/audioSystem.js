import { Components, GameStates } from '../components.js';

export function createAudioSystem(world, target = window) {
  const audioByEntity = new Map();
  let lastPlayable = null;
  let gestureArmed = false;

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  function isPlayable(state) {
    return state === GameStates.PLAYING;
  }

  function ensureAudio(entityId, track) {
    let audio = audioByEntity.get(entityId);
    if (audio === undefined) {
      audio = new Audio(track.src);
      audio.loop = track.loop;
      audio.volume = track.volume;
      audio.preload = 'auto';
      audioByEntity.set(entityId, audio);
    }
    return audio;
  }

  function armGestureUnlock() {
    if (gestureArmed) {
      return;
    }
    gestureArmed = true;
    target.addEventListener('click', onGesture);
    target.addEventListener('keydown', onGesture);
  }

  function disarmGestureUnlock() {
    if (!gestureArmed) {
      return;
    }
    gestureArmed = false;
    target.removeEventListener('click', onGesture);
    target.removeEventListener('keydown', onGesture);
  }

  function playAudio(audio) {
    let settled = false;
    const confirmPlayback = () => {
      if (settled) {
        return;
      }
      settled = true;
      audio.removeEventListener('playing', confirmPlayback);
      disarmGestureUnlock();
    };
    audio.addEventListener('playing', confirmPlayback);
    const promise = audio.play();
    if (promise !== undefined && typeof promise.then === 'function') {
      promise.then(confirmPlayback, () => {
        if (settled) {
          return;
        }
        settled = true;
        audio.removeEventListener('playing', confirmPlayback);
        armGestureUnlock();
      });
    }
  }

  function onGesture(event) {
    if (event !== undefined && event.type === 'keydown' && event.key === 'Escape') {
      return;
    }
    const gameState = getGameState();
    const playable = gameState !== null &&
      (isPlayable(gameState.current) || isPlayable(gameState.request));
    if (!playable) {
      return;
    }
    const tracks = world.query(Components.MusicTrack);
    for (let i = 0; i < tracks.length; i++) {
      const entityId = tracks[i];
      const audio = audioByEntity.get(entityId);
      if (audio === undefined) {
        const track = world.getComponent(entityId, Components.MusicTrack);
        playAudio(ensureAudio(entityId, track));
      } else if (audio.paused) {
        playAudio(audio);
      }
    }
  }

  return {
    init() {
      lastPlayable = null;
      armGestureUnlock();
    },

    update() {
      const gameState = getGameState();
      if (gameState === null) {
        lastPlayable = null;
        return;
      }

      const playable = isPlayable(gameState.current);
      if (playable === lastPlayable) {
        return;
      }
      lastPlayable = playable;

      const tracks = world.query(Components.MusicTrack);
      for (let i = 0; i < tracks.length; i++) {
        const entityId = tracks[i];
        if (playable) {
          const track = world.getComponent(entityId, Components.MusicTrack);
          playAudio(ensureAudio(entityId, track));
        } else {
          const audio = audioByEntity.get(entityId);
          if (audio !== undefined) {
            audio.pause();
          }
        }
      }
    },

    dispose() {
      disarmGestureUnlock();
      for (const audio of audioByEntity.values()) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      audioByEntity.clear();
      lastPlayable = null;
    },
  };
}
