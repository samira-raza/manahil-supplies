import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Category, Product } from '../types';
import { categoryOf, categoryFullName } from '../services/categories';
import { errorBoxCls } from '../services/errors';

// Linked products picker (agreed 14 Nov 2026): type to narrow the list, tick several products,
// then link them all with one button. Used on the product page and on Create Product / Save Copy.
// onConfirm returns '' when it worked, or a message to show inside the picker.

const MAX_SHOWN = 50;

const LinkPicker: React.FC<{
  candidates: Product[];          // already excludes archived, the product itself and products already linked
  categories: Category[];
  onConfirm: (ids: string[]) => Promise<string> | string;
  verb?: string;                  // "Link" on the product page, "Add" on Create Product
}> = ({ candidates, categories, onConfirm, verb = 'Link' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Every typed word must appear in the product name, in any order (e.g. "hemani mtcn")
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return candidates.filter(p => words.every(w => p.title.toLowerCase().includes(w)));
  }, [query, candidates]);

  const nameOf = (id: string) => candidates.find(p => p.id === id)?.title || 'Unknown product';
  const toggle = (id: string) => setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const close = () => { setOpen(false); setQuery(''); setPicked([]); setError(''); };

  const confirm = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setError('');
    const failed = await onConfirm(picked);
    setBusy(false);
    if (failed) setError(failed); else close();
  };

  const openButton = (
      <button type="button" onClick={() => setOpen(true)} disabled={candidates.length === 0}
        className="mt-3 w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 hover:border-indigo-300 font-bold text-xs text-indigo-600 text-left disabled:text-slate-400 disabled:hover:border-slate-200">
        {candidates.length === 0 ? 'No products left to link' : `+ ${verb} products`}
      </button>
  );
  if (!open) return openButton;

  // The picker opens as its own window (drawn on top of the page), so it has room even from a narrow column
  return (<>
    {openButton}
    {createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-2 md:p-4" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
    <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-label={verb === 'Link' ? 'Link products' : 'Add linked products'}>
      <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-start gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">{verb === 'Link' ? 'Link products' : 'Add linked products'}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Type to narrow the list, tick the products, then {verb.toLowerCase()} them in one go.</p>
        </div>
        <button type="button" onClick={close} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" aria-label="Close">✕</button>
      </div>
    <div className="p-4 md:p-5 space-y-3 overflow-y-auto">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map(id => (
            <span key={id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold max-w-full">
              <span className="truncate">{nameOf(id)}</span>
              <button type="button" onClick={() => toggle(id)} className="text-indigo-400 hover:text-red-600 shrink-0" aria-label="Remove from selection">✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        // Enter must not submit the surrounding Create Product form
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
        placeholder="Type to search products, e.g. MTCN Hemani"
        className="w-full px-3 py-3 rounded-lg bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"
        aria-label="Search products to link"
      />
      <ul className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {matches.slice(0, MAX_SHOWN).map(p => {
          const size = [p.unitSize, p.measuringUnit].filter(Boolean).join(' ');
          const isPicked = picked.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`flex items-start gap-2 px-2.5 py-2 cursor-pointer hover:bg-slate-50 ${isPicked ? 'bg-indigo-50/60' : ''}`}>
                <input type="checkbox" className="mt-0.5 shrink-0" style={{ minHeight: 0 }} checked={isPicked} onChange={() => toggle(p.id)} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 break-words">{p.title}</span>
                  <span className="block text-[11px] text-slate-500 font-bold">{categoryFullName(categoryOf(p, categories)) || p.category}{size ? ` · ${size}` : ''}</span>
                </span>
              </label>
            </li>
          );
        })}
        {matches.length === 0 && <li className="px-3 py-3 text-xs text-slate-400 italic">No matching products</li>}
      </ul>
      {matches.length > MAX_SHOWN && (
        <p className="text-[10px] text-slate-400 font-bold">Showing the first {MAX_SHOWN} of {matches.length}. Type more to narrow the list.</p>
      )}
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={close} className="px-4 py-2 rounded-lg font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 text-xs">Cancel</button>
        <button type="button" onClick={confirm} disabled={picked.length === 0 || busy}
          className="px-4 py-2 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700 text-xs disabled:opacity-40">
          {busy ? 'Saving...' : picked.length === 0 ? `${verb} products` : `${verb} ${picked.length} product${picked.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
    </div>
    </div>,
    document.body)}
  </>);
};

export default LinkPicker;
