import React, { useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CRMContext, generateId } from '../App';
import { Brand, BrandActivity, BrandSet, Product } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';
import { notSavedMessage, errorBoxCls } from '../services/errors';
import {
  parentBrands, childBrandsOf, setsOf, setText, setChildNames, productTitleFor,
  defaultInitials, suggestInitials, validInitials, brandPermissions,
} from '../services/brands';

// Brands section (agreed 12 Nov 2026, Decisions Log D37): parent brands, child brands, brand sets.

const inputCls = 'w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
const smallBtn = 'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600';
const primaryBtn = 'px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 uppercase tracking-widest text-[10px] disabled:opacity-50';
const cancelBtn = 'px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 uppercase tracking-widest text-[10px]';
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type Dialog =
  | { kind: 'parent'; brand?: Brand }
  | { kind: 'initials'; brand: Brand }
  | { kind: 'child'; parent: Brand; brand?: Brand }
  | { kind: 'move'; brand: Brand }
  | { kind: 'set'; parent: Brand }
  // run returns '' when it worked, or the message to show inside the dialog (BUG-281)
  | { kind: 'confirm'; title: string; message: string; label: string; run: () => Promise<string> };

const Brands: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const parents = useMemo(() => (ctx ? parentBrands(ctx.brands) : []), [ctx?.brands]);
  if (!ctx) return null;
  const { brands, setBrands, brandSets, setBrandSets, brandActivity, setBrandActivity, products, setProducts, currentUser } = ctx;
  const can = brandPermissions(currentUser);

  const productsOfParent = (id: string) => products.filter(p => p.brandParentId === id);
  const productsOfSet = (id: string) => products.filter(p => p.brandSetId === id);
  const productsOfChild = (id: string) => products.filter(p => brandSets.find(s => s.id === p.brandSetId)?.childIds.includes(id));
  const setsWithChild = (id: string) => brandSets.filter(s => s.childIds.includes(id));

  const log = async (entry: Omit<BrandActivity, 'id' | 'userId' | 'userName' | 'at'>) => {
    const a: BrandActivity = { ...entry, id: generateId(), userId: currentUser?.id, userName: currentUser?.name, at: new Date().toISOString() };
    const { error: e } = await db.insertBrandActivity(a);
    if (!e) setBrandActivity(prev => [a, ...prev]);
  };

  // After a spelling fix, every product using the brand gets its name rebuilt
  const renameProducts = async (nextBrands: Brand[], affected: Product[]) => {
    if (affected.length === 0) return true;
    const updates = affected.map(p => {
      const title = productTitleFor(p, nextBrands, brandSets);
      const brand = nextBrands.find(b => b.id === p.brandParentId)?.name || p.brand;
      return { id: p.id, title, brand };
    });
    const { error: e } = await db.updateProductNames(updates);
    if (e) { setError(`The brand was saved, but some product names were not updated: ${e.message}`); return false; }
    setProducts(prev => prev.map(p => { const u = updates.find(x => x.id === p.id); return u ? { ...p, title: u.title, brand: u.brand } : p; }));
    return true;
  };

  // Each save returns '' when it worked, or the message to show inside the open dialog (BUG-281)
  const saveBrand = async (b: Brand) => {
    setError('');
    const { error: e } = await db.upsertBrand(b);
    if (e) return notSavedMessage(e, 'The change');
    setBrands(prev => prev.some(x => x.id === b.id) ? prev.map(x => x.id === b.id ? b : x) : [...prev, b]);
    return '';
  };

  const setActive = async (target: { brand?: Brand; set?: BrandSet }, active: boolean) => {
    if (target.brand) {
      const failed = await saveBrand({ ...target.brand, isActive: active });
      if (failed) return failed;
      await log({ brandId: target.brand.id, type: active ? 'ENABLED' : 'DISABLED', details: `${target.brand.name} ${active ? 'switched back on' : 'disabled'}` });
    } else if (target.set) {
      const { error: e } = await db.setBrandSetActive(target.set.id, active);
      if (e) return notSavedMessage(e, 'The change');
      setBrandSets(prev => prev.map(s => s.id === target.set!.id ? { ...s, isActive: active } : s));
      await log({ brandId: target.set.parentId, setId: target.set.id, type: active ? 'ENABLED' : 'DISABLED', details: `Brand set ${setText(target.set, brands)} ${active ? 'switched back on' : 'disabled'}` });
    }
    return '';
  };

  const askDisable = (target: { brand?: Brand; set?: BrandSet }, active: boolean) => {
    const name = target.brand ? target.brand.name : `the brand set ${setText(target.set!, brands)}`;
    setDialog({
      kind: 'confirm',
      title: active ? 'Switch back on?' : 'Disable?',
      message: active
        ? `${name} can be used for new products again.`
        : `${name} can't be used for new products${target.brand && !target.brand.parentId ? ', and nor can its brand sets' : target.brand ? ', and nor can any brand set that includes it' : ''}. Existing products keep it and can still be ordered after a warning.`,
      label: active ? 'Switch on' : 'Disable',
      run: () => setActive(target, active),
    });
  };

  const askDelete = (target: { brand?: Brand; set?: BrandSet }) => {
    const name = target.brand ? target.brand.name : `the brand set ${setText(target.set!, brands)}`;
    setDialog({
      kind: 'confirm',
      title: 'Delete?',
      message: `${name} is not used by any product and will be removed. This cannot be undone.`,
      label: 'Delete',
      run: async () => {
        setError('');
        if (target.brand) {
          const { error: e } = await db.deleteBrand(target.brand.id);
          if (e) return `${target.brand.name} was not deleted. Check your internet connection and try again. (Details: ${e.message})`;
          setBrands(prev => prev.filter(b => b.id !== target.brand!.id));
          await log({ brandId: target.brand.parentId || target.brand.id, type: 'DELETED', details: `${target.brand.name} deleted` });
        } else if (target.set) {
          const { error: e } = await db.deleteBrandSet(target.set.id);
          if (e) return `The brand set was not deleted. Check your internet connection and try again. (Details: ${e.message})`;
          setBrandSets(prev => prev.filter(s => s.id !== target.set!.id));
          await log({ brandId: target.set.parentId, type: 'DELETED', details: `Brand set ${setText(target.set, brands)} deleted` });
        }
        return '';
      },
    });
  };

  const shown = parents.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.label || '').toLowerCase().includes(q) || (p.initials || '').toLowerCase().includes(q) ||
      childBrandsOf(p.id, brands).some(c => c.name.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Brands</h1>
          <p className="text-sm text-slate-500 mt-1">Parent brands, their child brands, and the brand sets products pick from</p>
        </div>
        {can.manage && (
          <button onClick={() => setDialog({ kind: 'parent' })} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto">
            <Icons.Plus /> Add Parent Brand
          </button>
        )}
      </div>

      {error && <div className={`${errorBoxCls} flex justify-between gap-3`}><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands, child brands, initials or labels..." className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-medium" />

      <div className="space-y-3">
        {shown.length === 0 && <div className="p-8 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">No brands yet.</div>}
        {shown.map(parent => {
          const children = childBrandsOf(parent.id, brands);
          const sets = setsOf(parent.id, brandSets).map(s => ({ s, text: setText(s, brands) })).sort((a, b) => a.text.localeCompare(b.text));
          const prods = productsOfParent(parent.id);
          const isOpen = expanded === parent.id;
          const history = brandActivity.filter(a => a.brandId === parent.id || children.some(c => c.id === a.brandId) || sets.some(x => x.s.id === a.setId)).slice(0, 15);
          const canDeleteParent = children.length === 0 && sets.length === 0 && prods.length === 0;
          return (
            <div key={parent.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${!parent.isActive ? 'opacity-60' : ''}`}>
              <button onClick={() => setExpanded(isOpen ? null : parent.id)} className="w-full p-4 md:p-6 flex items-center justify-between gap-3 text-left hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 text-base md:text-lg">{parent.name}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-900 text-white">{parent.initials}</span>
                    {!parent.isActive && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">Disabled</span>}
                  </div>
                  {parent.label && <div className="text-xs text-slate-500 font-bold mt-0.5">{parent.label}</div>}
                  <div className="text-[11px] text-slate-400 font-bold mt-1">{children.length} child brands · {sets.length} brand sets · {prods.length} products</div>
                </div>
                <span className="text-slate-400 text-xl shrink-0">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="px-4 md:px-6 pb-5 md:pb-6 space-y-5 border-t border-slate-100 pt-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {can.manage && <button className={smallBtn} onClick={() => setDialog({ kind: 'parent', brand: parent })}>Edit name / label</button>}
                    {can.changeInitials && <button className={smallBtn} onClick={() => setDialog({ kind: 'initials', brand: parent })}>Change initials</button>}
                    {can.disable && <button className={smallBtn} onClick={() => askDisable({ brand: parent }, !parent.isActive)}>{parent.isActive ? 'Disable' : 'Switch back on'}</button>}
                    {can.remove && canDeleteParent && <button className={smallBtn} onClick={() => askDelete({ brand: parent })}>Delete</button>}
                  </div>

                  {/* Child brands */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Child brands</h4>
                      {can.manage && <button className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest" onClick={() => setDialog({ kind: 'child', parent })}>+ Add child brand</button>}
                    </div>
                    {children.length === 0 ? <p className="text-xs text-slate-400 italic">None. Products can use the parent brand on its own.</p> : (
                      <div className="space-y-1.5">
                        {children.map(c => {
                          const inSets = setsWithChild(c.id);
                          const cProds = productsOfChild(c.id);
                          return (
                            <div key={c.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl bg-slate-50 ${!c.isActive ? 'opacity-60' : ''}`}>
                              <div className="text-sm font-bold text-slate-800">
                                {c.name}
                                {!c.isActive && <span className="ml-2 text-[9px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">Disabled</span>}
                                <span className="ml-2 text-[10px] text-slate-400">{inSets.length} sets · {cProds.length} products</span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {can.manage && <button className={smallBtn} onClick={() => setDialog({ kind: 'child', parent, brand: c })}>Rename</button>}
                                {can.manage && inSets.length === 0 && <button className={smallBtn} onClick={() => setDialog({ kind: 'move', brand: c })}>Move</button>}
                                {can.disable && <button className={smallBtn} onClick={() => askDisable({ brand: c }, !c.isActive)}>{c.isActive ? 'Disable' : 'Switch on'}</button>}
                                {can.remove && inSets.length === 0 && <button className={smallBtn} onClick={() => askDelete({ brand: c })}>Delete</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Brand sets */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand sets</h4>
                      {can.manage && children.length > 0 && <button className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest" onClick={() => setDialog({ kind: 'set', parent })}>+ Add brand set</button>}
                    </div>
                    {sets.length === 0 ? <p className="text-xs text-slate-400 italic">None yet. A set is a parent plus the child brands printed on one carton.</p> : (
                      <div className="space-y-1.5">
                        {sets.map(({ s, text }) => {
                          const sProds = productsOfSet(s.id);
                          const childOff = s.childIds.some(id => brands.find(b => b.id === id)?.isActive === false);
                          return (
                            <div key={s.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl bg-slate-50 ${!s.isActive ? 'opacity-60' : ''}`}>
                              <div className="text-sm font-bold text-slate-800">
                                {text}
                                {!s.isActive && <span className="ml-2 text-[9px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">Disabled</span>}
                                {s.isActive && childOff && <span className="ml-2 text-[9px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Includes a disabled brand</span>}
                                <span className="ml-2 text-[10px] text-slate-400">{sProds.length} products</span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {can.disable && <button className={smallBtn} onClick={() => askDisable({ set: s }, !s.isActive)}>{s.isActive ? 'Disable' : 'Switch on'}</button>}
                                {can.remove && sProds.length === 0 && <button className={smallBtn} onClick={() => askDelete({ set: s })}>Delete</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Brand page: its products */}
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Products ({prods.length})</h4>
                    {prods.length === 0 ? <p className="text-xs text-slate-400 italic">No products use this brand yet.</p> : (
                      <div className="space-y-1">
                        {prods.map(p => (
                          <Link key={p.id} to={`/products/${p.id}`} className={`block text-sm font-bold text-indigo-600 hover:underline ${p.isArchived ? 'opacity-50' : ''}`}>
                            {p.title}{p.isArchived ? ' (archived)' : ''}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* History */}
                  {history.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">History</h4>
                      <div className="space-y-1">
                        {history.map(a => (
                          <div key={a.id} className="text-xs text-slate-600"><span className="font-bold">{a.details}</span> <span className="text-slate-400">· {new Date(a.at).toLocaleString()}{a.userName ? ` · ${a.userName}` : ''}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {dialog?.kind === 'parent' && (
        <ParentDialog
          brand={dialog.brand}
          parents={parents}
          onClose={() => setDialog(null)}
          onSave={async (values) => {
            if (dialog.brand) {
              const before = dialog.brand;
              const next: Brand = { ...before, name: values.name, label: values.label || undefined };
              const failed = await saveBrand(next);
              if (failed) return failed;
              if (!same(before.name, next.name)) {
                await log({ brandId: next.id, type: 'RENAMED', details: `Renamed from "${before.name}" to "${next.name}"` });
                await renameProducts(brands.map(b => b.id === next.id ? next : b), productsOfParent(next.id));
              }
              if ((before.label || '') !== (next.label || '')) {
                await log({ brandId: next.id, type: 'LABEL_CHANGED', details: `Label changed from "${before.label || 'none'}" to "${next.label || 'none'}"` });
              }
            } else {
              const b: Brand = { id: generateId(), name: values.name, initials: values.initials, label: values.label || undefined, isActive: true, createdBy: currentUser?.name };
              const failed = await saveBrand(b);
              if (failed) return failed;
              await log({ brandId: b.id, type: 'CREATED', details: `${b.name} created with initials ${b.initials}` });
              setExpanded(b.id);
            }
            setDialog(null);
            return '';
          }}
        />
      )}

      {dialog?.kind === 'initials' && (
        <InitialsDialog
          brand={dialog.brand}
          parents={parents}
          onClose={() => setDialog(null)}
          onSave={async (initials) => {
            const before = dialog.brand.initials;
            const failed = await saveBrand({ ...dialog.brand, initials });
            if (failed) return failed;
            await log({ brandId: dialog.brand.id, type: 'INITIALS_CHANGED', details: `Initials changed from ${before} to ${initials}. Existing products and orders keep the old initials` });
            setDialog(null);
            return '';
          }}
        />
      )}

      {dialog?.kind === 'child' && (
        <ChildDialog
          parent={dialog.parent}
          brand={dialog.brand}
          brands={brands}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            if (dialog.brand) {
              const before = dialog.brand;
              const next: Brand = { ...before, name };
              const failed = await saveBrand(next);
              if (failed) return failed;
              await log({ brandId: next.id, type: 'RENAMED', details: `Child brand renamed from "${before.name}" to "${next.name}"` });
              await renameProducts(brands.map(b => b.id === next.id ? next : b), productsOfChild(next.id));
            } else {
              const b: Brand = { id: generateId(), name, parentId: dialog.parent.id, isActive: true, createdBy: currentUser?.name };
              const failed = await saveBrand(b);
              if (failed) return failed;
              await log({ brandId: b.id, type: 'CREATED', details: `Child brand ${b.name} added under ${dialog.parent.name}` });
            }
            setDialog(null);
            return '';
          }}
        />
      )}

      {dialog?.kind === 'move' && (
        <MoveDialog
          brand={dialog.brand}
          parents={parents.filter(p => p.id !== dialog.brand.parentId)}
          onClose={() => setDialog(null)}
          onSave={async (parentId) => {
            const from = brands.find(b => b.id === dialog.brand.parentId)?.name;
            const to = brands.find(b => b.id === parentId)?.name;
            const failed = await saveBrand({ ...dialog.brand, parentId });
            if (failed) return failed;
            await log({ brandId: dialog.brand.id, type: 'MOVED', details: `${dialog.brand.name} moved from ${from} to ${to}` });
            setDialog(null);
            return '';
          }}
        />
      )}

      {dialog?.kind === 'set' && (
        <SetDialog
          parent={dialog.parent}
          children={childBrandsOf(dialog.parent.id, brands).filter(c => c.isActive)}
          existing={setsOf(dialog.parent.id, brandSets)}
          brands={brands}
          onClose={() => setDialog(null)}
          onSave={async (childIds) => {
            setError('');
            const s: BrandSet = { id: generateId(), parentId: dialog.parent.id, childIds, isActive: true, createdBy: currentUser?.name };
            const { error: e } = await db.insertBrandSet(s);
            if (e) return notSavedMessage(e, 'The brand set');
            setBrandSets(prev => [...prev, s]);
            await log({ brandId: dialog.parent.id, setId: s.id, type: 'CREATED', details: `Brand set ${setText(s, brands)} created` });
            setDialog(null);
            return '';
          }}
        />
      )}

      {dialog?.kind === 'confirm' && (
        <ConfirmDialog key={dialog.title + dialog.message} title={dialog.title} message={dialog.message} label={dialog.label}
          onClose={() => setDialog(null)} run={dialog.run} />
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

const ConfirmButtons: React.FC<{ label: string; onCancel: () => void; onConfirm: () => void; disabled?: boolean }> = ({ label, onCancel, onConfirm, disabled }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={cancelBtn}>Cancel</button>
      <button type="button" disabled={busy || disabled} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} className={primaryBtn}>{busy ? 'Saving...' : label}</button>
    </div>
  );
};

// A confirmation box that stays open and shows the reason when the action fails (BUG-281)
const ConfirmDialog: React.FC<{ title: string; message: string; label: string; onClose: () => void; run: () => Promise<string> }> =
  ({ title, message, label, onClose, run }) => {
  const [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{message}</p>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label={label} onCancel={onClose} onConfirm={async () => {
        setError('');
        const failed = await run();
        if (failed) setError(failed); else onClose();
      }} />
    </Modal>
  );
};

const ParentDialog: React.FC<{ brand?: Brand; parents: Brand[]; onClose: () => void; onSave: (v: { name: string; initials: string; label: string }) => Promise<string> }> =
  ({ brand, parents, onClose, onSave }) => {
  const [name, setName] = useState(brand?.name || '');
  const [label, setLabel] = useState(brand?.label || '');
  const [initials, setInitials] = useState(brand?.initials || '');
  const [initialsEdited, setInitialsEdited] = useState(!!brand);
  const [error, setError] = useState('');
  const others = parents.filter(p => p.id !== brand?.id);
  const taken = others.map(p => p.initials || '');
  const holder = others.find(p => p.initials === initials);
  const nameClash = others.find(p => same(p.name, name));

  const onName = (v: string) => {
    setName(v);
    // Initials follow the name until the person edits them; a free pair is suggested if the usual one is taken
    if (!initialsEdited && !brand) setInitials(suggestInitials(v, taken));
  };

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Please enter the brand name.');
    if (nameClash) return setError(`A parent brand called "${nameClash.name}" already exists.`);
    if (!brand) {
      if (!validInitials(initials)) return setError('Initials must be 2 or 3 capital letters.');
      if (holder) return setError(`Initials ${initials} are already used by ${holder.name}.`);
    }
    const failed = await onSave({ name: name.trim(), initials, label: label.trim() });
    if (failed) setError(failed);
  };

  const usual = defaultInitials(name);
  const usualHolder = !brand && usual.length >= 2 ? others.find(p => p.initials === usual) : undefined;

  return (
    <Modal title={brand ? 'Edit Parent Brand' : 'Add Parent Brand'} subtitle={brand ? 'Spelling fixes update every product using it' : 'e.g. Bodyworks Charcoal'} onClose={onClose}>
      <div>
        <label className={labelCls}>Parent brand name*</label>
        <input className={inputCls} value={name} onChange={e => onName(e.target.value)} placeholder="e.g. Bodyworks Charcoal" autoFocus />
      </div>
      {!brand && (
        <div>
          <label className={labelCls}>Initials* (2 or 3 capital letters, used in product codes)</label>
          <input className={inputCls} value={initials} maxLength={3} onChange={e => { setInitialsEdited(true); setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); }} placeholder="e.g. BL" />
          {usualHolder && <p className="text-xs text-amber-700 font-bold mt-1">{usual} is already used by {usualHolder.name}. {initials && !holder ? `Suggested: ${initials}.` : ''}</p>}
          {holder && <p className="text-xs text-red-600 font-bold mt-1">{initials} is already used by {holder.name}.</p>}
          <p className="text-[11px] text-slate-400 mt-1">You can change them now. After saving, only the Super Admin can change them.</p>
        </div>
      )}
      <div>
        <label className={labelCls}>Short label (optional)</label>
        <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Charcoal Range" />
        <p className="text-[11px] text-slate-400 mt-1">Shown under product names and searchable. The name always keeps the full list of child brands.</p>
      </div>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label={brand ? 'Save changes' : 'Add brand'} onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

const InitialsDialog: React.FC<{ brand: Brand; parents: Brand[]; onClose: () => void; onSave: (initials: string) => Promise<string> }> = ({ brand, parents, onClose, onSave }) => {
  const [initials, setInitials] = useState(brand.initials || '');
  const [error, setError] = useState('');
  const holder = parents.find(p => p.id !== brand.id && p.initials === initials);
  const save = async () => {
    setError('');
    if (!validInitials(initials)) return setError('Initials must be 2 or 3 capital letters.');
    if (holder) return setError(`${initials} is already used by ${holder.name}.`);
    if (initials === brand.initials) return setError('These are the current initials.');
    const failed = await onSave(initials);
    if (failed) setError(failed);
  };
  return (
    <Modal title="Change Initials" subtitle={brand.name} onClose={onClose}>
      <p className="text-sm text-slate-600">Existing products and orders keep the old initials. New products use the new ones. The change is recorded.</p>
      <input className={inputCls} value={initials} maxLength={3} onChange={e => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
      {holder && <p className="text-xs text-red-600 font-bold">{initials} is already used by {holder.name}.</p>}
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label="Change initials" onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

const ChildDialog: React.FC<{ parent: Brand; brand?: Brand; brands: Brand[]; onClose: () => void; onSave: (name: string) => Promise<string> }> = ({ parent, brand, brands, onClose, onSave }) => {
  const [name, setName] = useState(brand?.name || '');
  const [error, setError] = useState('');
  // A child brand name exists under one parent only
  const clash = brands.find(b => b.parentId && b.id !== brand?.id && same(b.name, name));
  const clashParent = clash ? brands.find(b => b.id === clash.parentId)?.name : '';
  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Please enter the child brand name.');
    if (clash) return setError(`"${clash.name}" already exists under ${clashParent}. A child brand can belong to one parent only.`);
    const failed = await onSave(name.trim());
    if (failed) setError(failed);
  };
  return (
    <Modal title={brand ? 'Rename Child Brand' : 'Add Child Brand'} subtitle={`Under ${parent.name}`} onClose={onClose}>
      <div>
        <label className={labelCls}>Child brand name*</label>
        <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smoky Rose" autoFocus />
        {clash && <p className="text-xs text-red-600 font-bold mt-1">Already exists under {clashParent}.</p>}
        {brand && <p className="text-[11px] text-slate-400 mt-1">Every product using it gets its name updated.</p>}
      </div>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label={brand ? 'Save' : 'Add child brand'} onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

const MoveDialog: React.FC<{ brand: Brand; parents: Brand[]; onClose: () => void; onSave: (parentId: string) => Promise<string> }> = ({ brand, parents, onClose, onSave }) => {
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    const failed = await onSave(parentId);
    if (failed) setError(failed);
  };
  return (
    <Modal title="Move Child Brand" subtitle={brand.name} onClose={onClose}>
      <p className="text-sm text-slate-600">Only possible while no brand set uses it.</p>
      <select className={inputCls} value={parentId} onChange={e => setParentId(e.target.value)}>
        <option value="">-- Choose new parent --</option>
        {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label="Move" disabled={!parentId} onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

const SetDialog: React.FC<{ parent: Brand; children: Brand[]; existing: BrandSet[]; brands: Brand[]; onClose: () => void; onSave: (childIds: string[]) => Promise<string> }> =
  ({ parent, children, existing, brands, onClose, onSave }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const key = (ids: string[]) => [...ids].sort().join(',');
  const duplicate = existing.find(s => key(s.childIds) === key(picked));
  const preview = `${parent.name} [${setChildNames({ id: '', parentId: parent.id, childIds: picked, isActive: true }, brands).join(', ')}]`;
  const save = async () => {
    setError('');
    if (picked.length === 0) return setError('Tick at least one child brand.');
    if (duplicate) return setError('This brand set already exists.');
    const failed = await onSave(picked);
    if (failed) setError(failed);
  };
  return (
    <Modal title="Add Brand Set" subtitle="Fixed once saved. Different child brands means a new set." onClose={onClose}>
      <div className="space-y-2">
        {children.map(c => (
          <label key={c.id} className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
            {c.name}
          </label>
        ))}
      </div>
      {picked.length > 0 && <div className="p-3 rounded-xl bg-indigo-50 text-indigo-800 text-sm font-bold">{preview}</div>}
      {duplicate && <p className="text-xs text-red-600 font-bold">This brand set already exists.</p>}
      {error && <div className={errorBoxCls} role="alert">{error}</div>}
      <ConfirmButtons label="Save brand set" onCancel={onClose} onConfirm={save} />
    </Modal>
  );
};

export default Brands;
