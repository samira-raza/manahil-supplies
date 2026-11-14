import React, { useState } from 'react';
import { errorBoxCls } from '../services/errors';

// Shared dialog pieces (Brands, Categories). A dialog's action returns '' when it worked,
// or the message to show inside the dialog (BUG-280, 281).

export const primaryBtn = 'px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 uppercase tracking-widest text-[10px] disabled:opacity-50';
export const cancelBtn = 'px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 uppercase tracking-widest text-[10px]';

// A failed save's message, shown inside the dialog that was saving (BUG-5); nothing when empty
export const ErrorBox: React.FC<{ msg?: string }> = ({ msg }) =>
  msg ? <div className={errorBoxCls} role="alert">{msg}</div> : null;

export const Modal: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
    <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-lg shadow-2xl border border-slate-200 max-h-[95vh] flex flex-col">
      <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-start gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-black text-slate-900">{title}</h2>
          {subtitle && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">✕</button>
      </div>
      <div className="p-4 md:p-6 overflow-y-auto space-y-4">{children}</div>
    </div>
  </div>
);

export const ConfirmButtons: React.FC<{ label: string; onCancel: () => void; onConfirm: () => void | Promise<void>; disabled?: boolean }> = ({ label, onCancel, onConfirm, disabled }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={cancelBtn}>Cancel</button>
      <button type="button" disabled={busy || disabled} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} className={primaryBtn}>{busy ? 'Saving...' : label}</button>
    </div>
  );
};

// A confirmation box that stays open and shows the reason when the action fails
export const ConfirmDialog: React.FC<{ title: string; message: React.ReactNode; label: string; onClose: () => void; run: () => Promise<string> }> =
  ({ title, message, label, onClose, run }) => {
  const [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-slate-600">{message}</div>
      <ErrorBox msg={error} />
      <ConfirmButtons label={label} onCancel={onClose} onConfirm={async () => {
        setError('');
        const failed = await run();
        if (failed) setError(failed); else onClose();
      }} />
    </Modal>
  );
};
