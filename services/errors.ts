// BUG-5: the same plain message wherever a save fails, so nobody thinks a change was saved when it wasn't.
// The screen keeps what was typed (nothing is shown as saved) so the person can try again.
export const notSavedMessage = (e?: { message?: string } | null, what = 'This change', verb = 'saved') =>
  `${what} was not ${verb}. Check your internet connection and try again.${e?.message ? ` (Details: ${e.message})` : ''}`;

export const errorBoxCls = 'p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold';
