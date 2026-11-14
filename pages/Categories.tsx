
import React, { useContext, useState } from 'react';
import { CRMContext, generateId } from '../App';
import { Category, CategoryActivity } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';
import { productTitleFor } from '../services/brands';
import { notSavedMessage, errorBoxCls } from '../services/errors';
import {
  categoryFullName, sortCategories, productsInCategory, suggestShortCode, defaultShortCode, validShortCode, categoryPermissions,
} from '../services/categories';

// Categories section (agreed 12 Nov 2026, Decisions Log D38): full name, word in product names, short code.

const inputCls = 'w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm disabled:bg-slate-100 disabled:text-slate-500';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
const primaryBtn = 'px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 uppercase tracking-widest text-[10px] disabled:opacity-50';
const cancelBtn = 'px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 uppercase tracking-widest text-[10px]';
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type FormValues = { fullName: string; word: string; shortCode: string; description: string };

type Dialog =
  | { kind: 'form'; category?: Category }
  // run returns '' when it worked, or the message to show inside the dialog (BUG-280)
  | { kind: 'confirm'; title: string; message: React.ReactNode; label: string; run: () => Promise<string> }
  | { kind: 'info'; title: string; message: string };

const Categories: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);

  if (!ctx) return null;
  const { categories, setCategories, categoryActivity, setCategoryActivity, products, setProducts, brands, brandSets, currentUser } = ctx;
  const can = categoryPermissions(currentUser);
  const sorted = sortCategories(categories);

  const log = async (entry: Omit<CategoryActivity, 'id' | 'userId' | 'userName' | 'at'>) => {
    const a: CategoryActivity = { ...entry, id: generateId(), userId: currentUser?.id, userName: currentUser?.name, at: new Date().toISOString() };
    const { error: e } = await db.insertCategoryActivity(a);
    if (!e) setCategoryActivity(prev => [a, ...prev]);
  };

  // Each save returns '' when it worked, or the message to show inside the open dialog (BUG-280)
  const saveCategory = async (c: Category) => {
    setError('');
    const { error: e } = await db.upsertCategory(c);
    if (e) {
      return e.code === '23505'
        ? 'The category was not saved: another category already uses this full name, word or short code.'
        : notSavedMessage(e, 'The category');
    }
    setCategories(prev => prev.some(x => x.id === c.id) ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]);
    return '';
  };

  // When the word in product names changes, every product in the category gets its name rebuilt
  const renamedProducts = (c: Category, word: string) =>
    productsInCategory(c, products).map(p => ({ product: p, title: productTitleFor({ ...p, category: word }, brands, brandSets) }));

  const renameProducts = async (c: Category, word: string) => {
    const updates = renamedProducts(c, word).map(r => ({ id: r.product.id, title: r.title, category: word, categoryId: c.id }));
    if (updates.length === 0) return true;
    const { error: e } = await db.updateProductCategoryNames(updates);
    if (e) { setError(`The category was saved, but some product names were not updated: ${e.message}`); return false; }
    setProducts(prev => prev.map(p => {
      const u = updates.find(x => x.id === p.id);
      return u ? { ...p, title: u.title, category: u.category, categoryId: u.categoryId } : p;
    }));
    return true;
  };

  const addCategory = async (v: FormValues) => {
    const c: Category = {
      id: generateId(), name: v.word, fullName: v.fullName, shortCode: v.shortCode, description: v.description,
      createdBy: currentUser?.name,
    };
    const failed = await saveCategory(c);
    if (failed) return failed;
    await log({ categoryId: c.id, type: 'CREATED', details: `${c.fullName} added (word in product names: ${c.name}, short code: ${c.shortCode})` });
    return '';
  };

  const updateCategory = async (old: Category, v: FormValues) => {
    const next: Category = { ...old, name: v.word, fullName: v.fullName, shortCode: v.shortCode, description: v.description };
    const failed = await saveCategory(next);
    if (failed) return failed;
    const oldFull = categoryFullName(old);
    if (oldFull !== v.fullName) {
      await log({ categoryId: old.id, type: 'FULL_NAME_CHANGED', details: `Full name changed from ${oldFull} to ${v.fullName}` });
    }
    if ((old.shortCode || '') !== v.shortCode) {
      await log({ categoryId: old.id, type: 'CODE_CHANGED', details: `${v.fullName}: short code changed from ${old.shortCode || '(none)'} to ${v.shortCode}` });
    }
    if (old.name !== v.word) {
      const count = productsInCategory(old, products).length;
      const ok = await renameProducts(old, v.word);
      await log({
        categoryId: old.id, type: 'WORD_CHANGED',
        details: `${v.fullName}: word in product names changed from ${old.name} to ${v.word}` +
          (count > 0 ? `, ${count} product${count === 1 ? '' : 's'} renamed${ok ? '' : ' (some failed, see the message on screen)'}` : ''),
      });
    }
    // The category itself was saved, so the dialog closes; a product-rename failure shows on the page
    return '';
  };

  // Saving an edit: if the word in product names changes and products use the category, show the preview first
  const onSaveForm = async (v: FormValues, old?: Category) => {
    const done = (failed: string) => { if (!failed) setDialog(null); return failed; };
    if (!old) return done(await addCategory(v));
    const renames = old.name !== v.word ? renamedProducts(old, v.word) : [];
    if (renames.length === 0) return done(await updateCategory(old, v));
    const n = renames.length;
    setDialog({
      kind: 'confirm',
      title: `${n} product name${n === 1 ? '' : 's'} will change`,
      label: `Change all ${n}`,
      message: (
        <div className="space-y-3">
          <p>The word in product names for {v.fullName} changes from <b>{old.name}</b> to <b>{v.word}</b>. Every product in this category is renamed.</p>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Example</div>
            <div className="text-slate-500 line-through break-words">{renames[0].product.title}</div>
            <div className="text-slate-900 font-bold break-words">{renames[0].title}</div>
          </div>
          <p className="text-xs text-slate-500">Product codes, prices, suppliers, linked products and past order quantities and prices don't change. Past orders show the new name.</p>
        </div>
      ),
      run: () => updateCategory(old, v),
    });
    return '';
  };

  const askDelete = (c: Category) => {
    const used = productsInCategory(c, products);
    if (used.length > 0) {
      const archived = used.filter(p => p.isArchived).length;
      setDialog({
        kind: 'info',
        title: `${categoryFullName(c)} can't be deleted`,
        message: `${used.length} product${used.length === 1 ? ' uses' : 's use'} ${categoryFullName(c)}${archived > 0 ? ` (${archived} of them archived)` : ''}. Move ${used.length === 1 ? 'it' : 'them'} to another category (Edit Info on the product page) or delete ${used.length === 1 ? 'it' : 'them'} first.`,
      });
      return;
    }
    setDialog({
      kind: 'confirm',
      title: `Delete ${categoryFullName(c)}?`,
      label: 'Delete',
      message: `${categoryFullName(c)} is not used by any product and will be removed. This cannot be undone.`,
      run: async () => {
        setError('');
        const { error: e } = await db.deleteCategory(c.id);
        if (e) {
          return e.code === '23503'
            ? `${categoryFullName(c)} was not deleted: products still use it. Move them to another category first.`
            : notSavedMessage(e, categoryFullName(c), 'deleted');
        }
        setCategories(prev => prev.filter(x => x.id !== c.id));
        await log({ categoryId: c.id, type: 'DELETED', details: `${categoryFullName(c)} deleted (word ${c.name}, short code ${c.shortCode || '(none)'})` });
        return '';
      },
    });
  };

  const history = showAllHistory ? categoryActivity : categoryActivity.slice(0, 15);

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">The type of item each product is. Each category has a full name, the word used in product names, and a short code for product codes.</p>
        </div>
        {can.add && (
          <button
            onClick={() => setDialog({ kind: 'form' })}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto shrink-0"
          >
            <Icons.Plus />
            Add Category
          </button>
        )}
      </div>

      {error && <div className={errorBoxCls}>{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {sorted.map(cat => {
          const count = productsInCategory(cat, products).length;
          return (
            <div key={cat.id} className="bg-white p-5 md:p-6 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-lg md:text-xl font-bold text-slate-900 break-words">{categoryFullName(cat)}</h3>
                  {cat.shortCode
                    ? <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 tracking-widest shrink-0" title="Short code, used in product codes">{cat.shortCode}</span>
                    : <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-amber-50 text-amber-700 shrink-0">No short code</span>}
                </div>
                <div className="text-xs text-slate-600 mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In product names: </span>
                  <span className="font-bold">{cat.name}</span>
                </div>
                {cat.description && <p className="text-xs md:text-sm text-slate-500 leading-relaxed">{cat.description}</p>}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{count} product{count === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-3">
                  {can.editFullName && (
                    <button onClick={() => setDialog({ kind: 'form', category: cat })} className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">Edit</button>
                  )}
                  {can.remove && (
                    <button onClick={() => askDelete(cat)} className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors">Delete</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="text-sm text-slate-400 italic">No categories yet.</div>}
      </div>

      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-50 bg-slate-50/30">
          <h3 className="text-base md:text-lg font-black text-slate-900">Category history</h3>
          <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">Every category added, renamed, recoded or deleted, with who did it</p>
        </div>
        <div className="p-4 md:p-6 space-y-3">
          {history.map(a => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 border-b border-slate-50 pb-2">
              <span className="text-sm text-slate-700">{a.details}</span>
              <span className="text-[10px] font-bold text-slate-400 shrink-0">{new Date(a.at).toLocaleString()}{a.userName ? ` · ${a.userName}` : ''}</span>
            </div>
          ))}
          {categoryActivity.length === 0 && <div className="text-xs text-slate-400 italic">No changes recorded yet.</div>}
          {categoryActivity.length > 15 && (
            <button onClick={() => setShowAllHistory(v => !v)} className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest">
              {showAllHistory ? 'Show latest 15 only' : `Show all ${categoryActivity.length}`}
            </button>
          )}
        </div>
      </div>

      {dialog?.kind === 'form' && (
        <CategoryDialog
          category={dialog.category}
          others={categories.filter(c => c.id !== dialog.category?.id)}
          productCount={dialog.category ? productsInCategory(dialog.category, products).length : 0}
          can={can}
          onClose={() => setDialog(null)}
          onSave={v => onSaveForm(v, dialog.category)}
        />
      )}

      {dialog?.kind === 'confirm' && (
        <ConfirmDialog key={dialog.title} title={dialog.title} message={dialog.message} label={dialog.label}
          onClose={() => setDialog(null)} run={dialog.run} />
      )}

      {dialog?.kind === 'info' && (
        <Modal title={dialog.title} onClose={() => setDialog(null)}>
          <p className="text-sm text-slate-600">{dialog.message}</p>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={() => setDialog(null)} className={primaryBtn}>OK</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ---- Dialogs ----

const Modal: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
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

const ConfirmButtons: React.FC<{ label: string; onCancel: () => void; onConfirm: () => void | Promise<void> }> = ({ label, onCancel, onConfirm }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={cancelBtn}>Cancel</button>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} className={primaryBtn}>{busy ? 'Saving...' : label}</button>
    </div>
  );
};

// A confirmation box that keeps itself open and shows the reason when the action fails (BUG-280)
const ConfirmDialog: React.FC<{ title: string; message: React.ReactNode; label: string; onClose: () => void; run: () => Promise<string> }> =
  ({ title, message, label, onClose, run }) => {
  const [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-slate-600">{message}</div>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label={label} onCancel={onClose} onConfirm={async () => {
        setError('');
        const failed = await run();
        if (failed) setError(failed); else onClose();
      }} />
    </Modal>
  );
};

const CategoryDialog: React.FC<{
  category?: Category;
  others: Category[];
  productCount: number;
  can: ReturnType<typeof categoryPermissions>;
  onClose: () => void;
  onSave: (v: FormValues) => Promise<string>;
}> = ({ category, others, productCount, can, onClose, onSave }) => {
  const isNew = !category;
  const [fullName, setFullName] = useState(category ? categoryFullName(category) : '');
  const [word, setWord] = useState(category?.name || '');
  const [shortCode, setShortCode] = useState(category?.shortCode || '');
  const [description, setDescription] = useState(category?.description || '');
  const [wordEdited, setWordEdited] = useState(!isNew);
  const [codeEdited, setCodeEdited] = useState(!isNew);
  const [error, setError] = useState('');

  const takenCodes = others.map(c => c.shortCode || '').filter(Boolean);
  const codeHolder = others.find(c => c.shortCode && c.shortCode === shortCode);
  const fullNameClash = others.find(c => same(categoryFullName(c), fullName));
  const wordClash = others.find(c => same(c.name, word));
  const canWord = isNew || can.editWord;
  const canCode = isNew || can.editShortCode;

  // For a new category the word and the short code follow the full name until the person edits them
  const onFullName = (v: string) => {
    setFullName(v);
    if (isNew && !wordEdited) setWord(v);
    if (isNew && !codeEdited) setShortCode(suggestShortCode(v, takenCodes));
  };

  const save = async () => {
    setError('');
    const f = fullName.trim(), w = word.trim();
    if (!f) return setError('Please enter the full name.');
    if (!w) return setError('Please enter the word used in product names.');
    if (fullNameClash) return setError(`Another category is already called "${categoryFullName(fullNameClash)}".`);
    if (wordClash) return setError(`"${wordClash.name}" is already the word for ${categoryFullName(wordClash)}.`);
    if (canCode) {
      if (!validShortCode(shortCode)) return setError('The short code must be 2 or 3 capital letters.');
      if (codeHolder) return setError(`Short code ${shortCode} is already used by ${categoryFullName(codeHolder)}.`);
    }
    const failed = await onSave({ fullName: f, word: w, shortCode, description: description.trim() });
    if (failed) setError(failed);
  };

  const usual = defaultShortCode(fullName);
  const usualHolder = isNew && !codeEdited && usual.length >= 2 ? others.find(c => c.shortCode === usual) : undefined;

  return (
    <Modal title={isNew ? 'Add Category' : `Edit ${categoryFullName(category)}`} subtitle={isNew ? 'e.g. Master Carton' : `${productCount} product${productCount === 1 ? '' : 's'} in this category`} onClose={onClose}>
      <div>
        <label className={labelCls}>Full name*</label>
        <input className={inputCls} value={fullName} onChange={e => onFullName(e.target.value)} placeholder="e.g. Master Carton" autoFocus={isNew} />
        <p className="text-[11px] text-slate-400 mt-1">Shown in lists and filters. Changing it never changes product names.</p>
      </div>
      <div>
        <label className={labelCls}>Word in product names*</label>
        <input className={inputCls} value={word} disabled={!canWord} onChange={e => { setWordEdited(true); setWord(e.target.value); }} placeholder="e.g. MTCN or Tray" />
        <p className="text-[11px] text-slate-400 mt-1">
          The first word of every product name: the full word (Tray) or a short form (MTCN).
          {!isNew && (canWord
            ? (productCount > 0 ? ` Changing it renames all ${productCount} product${productCount === 1 ? '' : 's'} in this category.` : '')
            : ' Only the Super Admin can change it.')}
        </p>
      </div>
      <div>
        <label className={labelCls}>Short code* (2 or 3 capital letters, used in product codes)</label>
        <input className={inputCls} value={shortCode} maxLength={3} disabled={!canCode}
          onChange={e => { setCodeEdited(true); setShortCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); }} placeholder="e.g. MC" />
        {usualHolder && <p className="text-xs text-amber-700 font-bold mt-1">{usual} is already used by {categoryFullName(usualHolder)}. {shortCode && !codeHolder ? `Suggested: ${shortCode}.` : ''}</p>}
        {codeHolder && <p className="text-xs text-red-600 font-bold mt-1">{shortCode} is already used by {categoryFullName(codeHolder)}.</p>}
        <p className="text-[11px] text-slate-400 mt-1">
          {isNew ? 'Suggested from the full name. You can change it now. ' : ''}
          {!canCode ? 'Only the Super Admin can change it. ' : ''}
          Once product codes start using it, it will be locked.
        </p>
      </div>
      <div>
        <label className={labelCls}>Description (optional)</label>
        <textarea className={`${inputCls} h-20 resize-none`} value={description} onChange={e => setDescription(e.target.value)} placeholder="What items fall under this category" />
      </div>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label={isNew ? 'Add category' : 'Save changes'} onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

export default Categories;
