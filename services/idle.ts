// Auto sign-out after 2 minutes with no activity (agreed 14 Nov 2026, Login card).
// The last activity time is kept in localStorage so every open tab shares it:
// working in one tab keeps the others signed in, and a closed browser can't reopen an old session.

export const IDLE_LIMIT_MS = 2 * 60 * 1000;   // sign out after 2 minutes
export const IDLE_WARNING_MS = 15 * 1000;     // warn 15 seconds before

const LAST_ACTIVE_KEY = 'packtrack_last_activity';
const SIGNED_OUT_KEY = 'packtrack_idle_signed_out';

export const markActive = () => {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* storage blocked: timer still runs in this tab */ }
};

export const lastActive = () => {
  try { return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch { return 0; }
};

// True when a saved session has been idle for longer than the limit (e.g. the browser was closed and reopened later)
export const idleExpired = () => {
  const t = lastActive();
  return t > 0 && Date.now() - t >= IDLE_LIMIT_MS;
};

// A note for the login screen, so the person knows why they were signed out
export const noteIdleSignOut = () => { try { sessionStorage.setItem(SIGNED_OUT_KEY, '1'); } catch { /* ignore */ } };
export const takeIdleSignOutNote = () => {
  try {
    const was = sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    return was;
  } catch { return false; }
};
