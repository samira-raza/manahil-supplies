import React, { useEffect, useState } from 'react';
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, markActive, lastActive, noteIdleSignOut } from '../services/idle';

// Signs the person out after 10 minutes with no mouse, keyboard, scroll or touch activity.
// 15 seconds before, a warning with a "Stay signed in" button appears.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

const IdleLogout: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    markActive();
    let lastWrite = Date.now();
    // Activity is written at most once a second, so moving the mouse doesn't flood storage
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      markActive();
    };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { capture: true, passive: true }));

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActive();
      if (idle >= IDLE_LIMIT_MS) {
        noteIdleSignOut();
        onSignOut();
        return;
      }
      setSecondsLeft(idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : null);
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity, { capture: true }));
      window.clearInterval(timer);
    };
  }, [onSignOut]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-sm shadow-2xl border border-slate-200 p-6 md:p-8 text-center space-y-4">
        <h2 id="idle-title" className="text-lg md:text-xl font-black text-slate-900">Are you still there?</h2>
        <p className="text-sm text-slate-600">
          You'll be signed out in <b>{secondsLeft} second{secondsLeft === 1 ? '' : 's'}</b> because the app hasn't been used for a while.
          Anything not saved will be lost.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => { markActive(); setSecondsLeft(null); }}
          className="w-full px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 uppercase tracking-widest text-[10px]"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
};

export default IdleLogout;
