const BEST_SCORE_KEY = 'neonVendettaBest';

export function loadBestScore() {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsed = Number.parseInt(raw === null ? '0' : raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(value) {
  const clamped = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(clamped));
  } catch {
    // Storage unavailable (private mode, quota); best score is lost, game continues.
  }
}
