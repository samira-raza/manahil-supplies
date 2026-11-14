
import React, { useContext, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CRMContext, generateId } from '../App';
import { Icons } from '../constants';
import { Brand, BrandSet, Category, Product, ProductActivity, ProductActivityType, ProductPrice, ProductSupplier, UserRole } from '../types';
import { buildProductTitle, contentsPart, disabledBrandNames, entryText, productBrandParts } from '../services/brands';
import { db } from '../services/db';
import { notSavedMessage, errorBoxCls } from '../services/errors';
import { useFieldErrors, FieldErrors } from '../services/formErrors';
import FieldMessage from '../components/FieldMessage';
import { ErrorBox } from '../components/Dialog';
import LinkPicker from '../components/LinkPicker';
import { categoryOf, categoryFullName, categoryLabel, sortCategories, productCategoryName, productSizeLabel } from '../services/categories';
import { localToday, mainSupplier, activeSuppliers, orderedSuppliers, priceOn, priceRecordOn, sortPrices, supplierOf, hasSupplier } from '../services/pricing';
import { productPermissions } from '../services/permissions';

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();

  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [priceDialog, setPriceDialog] = useState<{ vendorId?: string; edit?: ProductPrice } | null>(null);
  const [supplierDialog, setSupplierDialog] = useState<{ replace?: ProductSupplier } | null>(null);
  const [stopMainDialog, setStopMainDialog] = useState<ProductSupplier | null>(null);
  const [deletePriceDialog, setDeletePriceDialog] = useState<{ supplier: ProductSupplier; price: ProductPrice } | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<'archive' | 'restore' | 'delete' | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showAllDeliveries, setShowAllDeliveries] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // All deliveries of this product, newest first (kept above the early returns so hook order never changes)
  const productDeliveries = useMemo(() => {
    if (!ctx || !id) return [];
    return ctx.deliveries
      .filter(d => d.items.some(item => item.productId === id))
      .sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
  }, [ctx?.deliveries, id]);

  if (!ctx || !id) return null;
  const { products, setProducts, vendors, measuringUnits, currentUser, orders } = ctx;
  const can = productPermissions(currentUser);
  const isSupplierRole = currentUser?.role === UserRole.VENDOR || currentUser?.role === UserRole.VENDOR_STAFF;
  const mySupplierId = currentUser?.vendorId;

  const product = products.find(p => p.id === id);
  if (!product || (isSupplierRole && !hasSupplier(product, mySupplierId))) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-6 md:p-8">
        <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-4">Product Not Found</h2>
        <button onClick={() => navigate('/products')} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Back to Products</button>
      </div>
    );
  }

  const vendorName = (vendorId?: string) => vendors.find(v => v.id === vendorId)?.name || 'Unknown supplier';
  // Vendors only ever see their own supplier entry
  const shownSuppliers = isSupplierRole
    ? product.suppliers.filter(s => s.vendorId === mySupplierId)
    : orderedSuppliers(product);
  const main = mainSupplier(product);
  const headline = isSupplierRole ? shownSuppliers[0] : main;
  const otherActive = isSupplierRole ? [] : activeSuppliers(product).filter(s => s.id !== main?.id);
  const today = localToday();

  // A product that appears on any order (or delivery) can never be deleted, only archived
  const everOrdered = orders.some(o => o.items.some(i => i.productId === product.id)) || productDeliveries.length > 0;

  // While a dialog is open, a failed save shows inside that dialog instead of behind it (BUG-282).
  // Closing a dialog with Cancel or X clears the message, so it doesn't reappear on the page.
  const dialogOpen = showMetadataModal || !!priceDialog || !!supplierDialog || !!stopMainDialog || !!lifecycleDialog || !!deletePriceDialog;
  const dismiss = (close: () => void) => () => { setActionError(''); close(); };

  // Records what happened in the product's activity log and updates the screen
  const logActivity = async (updated: Product, type: ProductActivityType, details: string) => {
    const entry: ProductActivity = {
      id: generateId(),
      productId: updated.id,
      type,
      details,
      userId: currentUser?.id,
      userName: currentUser?.name,
      at: new Date().toISOString(),
    };
    const { error: logError } = await db.insertProductActivity(entry);
    const withLog = logError ? updated : { ...updated, activity: [entry, ...updated.activity] };
    setProducts(prev => prev.map(p => p.id === updated.id ? withLog : p));
    if (logError) setActionError(`The change was saved, but the activity log was not: ${logError.message}`);
  };

  // Links several products in one go (search picker, agreed 14 Nov 2026). Still two-way, and each link
  // is recorded in both products' history. Returns '' when it worked, or the message for the picker.
  const linkMany = async (ids: string[]) => {
    const others = ids.map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p);
    if (others.length === 0) return '';
    const res = await db.addProductLinks(product.id, others.map(o => o.id), currentUser?.name);
    if (res.error) return notSavedMessage(res.error, others.length === 1 ? 'The link' : 'The links', 'added');
    const mine = [...(product.relatedProductIds || []).filter(x => !ids.includes(x)), ...others.map(o => o.id)];
    const related = new Map<string, string[]>([[product.id, mine]]);
    others.forEach(o => related.set(o.id, [...(o.relatedProductIds || []).filter(x => x !== product.id), product.id]));
    // Every product's link list, then every history line, is written at the same time (not one by one)
    await Promise.all([...related].map(([id, list]) => db.setRelatedMirror(id, list)));
    const at = new Date().toISOString();
    const entry = (productId: string, details: string): ProductActivity =>
      ({ id: generateId(), productId, type: 'LINK_ADDED', details, userId: currentUser?.id, userName: currentUser?.name, at });
    const entries = others.flatMap(o => [entry(product.id, `Linked to "${o.title}"`), entry(o.id, `Linked to "${product.title}"`)]);
    const results = await Promise.all(entries.map(e => db.insertProductActivity(e)));
    const logged = entries.filter((_, i) => !results[i].error);
    // One screen update for all the products involved; the newest history line first, as before
    setProducts(prev => prev.map(p => related.has(p.id)
      ? { ...p, relatedProductIds: related.get(p.id), activity: [...logged.filter(e => e.productId === p.id).reverse(), ...p.activity] }
      : p));
    const logError = results.find(r => r.error)?.error;
    if (logError) setActionError(`The links were saved, but some activity log entries were not: ${logError.message}`);
    return '';
  };

  // Removing a link removes it from both products and is recorded in both histories (links are added with linkMany)
  const removeLink = async (otherId: string) => {
    const other = products.find(p => p.id === otherId);
    if (!other) return;
    setActionError('');
    const res = await db.removeProductLink(product.id, otherId);
    if (res.error) {
      setActionError(notSavedMessage(res.error, 'The link', 'removed'));
      return;
    }
    const mine = (product.relatedProductIds || []).filter(x => x !== otherId);
    const theirs = (other.relatedProductIds || []).filter(x => x !== product.id);
    await Promise.all([db.setRelatedMirror(product.id, mine), db.setRelatedMirror(otherId, theirs)]);
    await logActivity({ ...product, relatedProductIds: mine }, 'LINK_REMOVED', `Link to "${other.title}" removed`);
    await logActivity({ ...other, relatedProductIds: theirs }, 'LINK_REMOVED', `Link to "${product.title}" removed`);
  };

  const setArchived = async (archived: boolean) => {
    setActionError('');
    setLifecycleBusy(true);
    const { error } = await db.setProductArchived(product.id, archived, currentUser?.name);
    setLifecycleBusy(false);
    if (error) {
      setActionError(notSavedMessage(error, 'The product', archived ? 'archived' : 'brought back'));
      return;
    }
    const updated: Product = archived
      ? { ...product, isArchived: true, archivedBy: currentUser?.name, archivedAt: new Date().toISOString() }
      : { ...product, isArchived: false, archivedBy: undefined, archivedAt: undefined };
    await logActivity(updated, archived ? 'ARCHIVED' : 'RESTORED',
      archived ? 'Product archived. It can no longer be added to orders' : 'Product brought back from the archive. It can be ordered again');
    setLifecycleDialog(null);
  };

  const deleteProduct = async () => {
    // Checked again at the moment of deleting, in case an order was placed meanwhile
    if (everOrdered) { setLifecycleDialog(null); return; }
    setActionError('');
    setLifecycleBusy(true);
    const { activity, ...rest } = product;
    const record = await db.recordDeletedProduct({ id: generateId(), productId: product.id, title: product.title, snapshot: rest, deletedBy: currentUser?.name });
    if (record.error) {
      setLifecycleBusy(false);
      setActionError(notSavedMessage(record.error, 'The product', 'deleted'));
      return;
    }
    const linkedFrom = products.filter(p => p.id !== product.id && (p.relatedProductIds || []).includes(product.id));
    const unlink = await db.unlinkRelatedProduct(product.id, linkedFrom);
    if (unlink.error) {
      setLifecycleBusy(false);
      setActionError(notSavedMessage(unlink.error, 'The product', 'deleted'));
      return;
    }
    const { error } = await db.deleteProduct(product.id);
    setLifecycleBusy(false);
    if (error) {
      setActionError(notSavedMessage(error, 'The product', 'deleted'));
      return;
    }
    setProducts(prev => prev
      .filter(p => p.id !== product.id)
      .map(p => linkedFrom.some(l => l.id === p.id) ? { ...p, relatedProductIds: (p.relatedProductIds || []).filter(r => r !== product.id) } : p));
    // Linked products record that the link went with the deleted product
    for (const l of linkedFrom) {
      await logActivity({ ...l, relatedProductIds: (l.relatedProductIds || []).filter(r => r !== product.id) }, 'LINK_REMOVED',
        `Link to "${product.title}" removed (that product was deleted)`);
    }
    navigate('/products');
  };

  // Saves the changed product, then records what happened in the product's activity log
  const saveChange = async (updated: Product, type: ProductActivityType, details: string) => {
    setActionError('');
    const { error } = await db.saveProductWithSuppliers(updated);
    if (error) {
      setActionError(notSavedMessage(error, 'The change'));
      return false;
    }
    await logActivity(updated, type, details);
    return true;
  };

  const withSupplier = (supplierId: string, change: (s: ProductSupplier) => ProductSupplier): Product => ({
    ...product,
    suppliers: product.suppliers.map(s => s.id === supplierId ? change(s) : s),
  });

  const setMain = async (target: ProductSupplier | null) => {
    const updated: Product = { ...product, suppliers: product.suppliers.map(s => ({ ...s, isMain: !!target && s.id === target.id })) };
    const details = target
      ? `Main supplier changed${main ? ` from ${vendorName(main.vendorId)}` : ''} to ${vendorName(target.vendorId)}`
      : `${main ? vendorName(main.vendorId) : 'Supplier'} removed as main supplier. No main supplier now`;
    await saveChange(updated, 'MAIN_SWITCHED', details);
  };

  const stopSupplier = async (sup: ProductSupplier, newMainId: string | null) => {
    const updated: Product = {
      ...product,
      suppliers: product.suppliers.map(s => {
        if (s.id === sup.id) return { ...s, isActive: false, isMain: false };
        if (sup.isMain) return { ...s, isMain: s.id === newMainId };
        return s;
      }),
    };
    let details = `${vendorName(sup.vendorId)} stopped for this product`;
    if (sup.isMain) {
      const nm = updated.suppliers.find(s => s.isMain);
      details += nm ? `. New main supplier: ${vendorName(nm.vendorId)}` : '. No main supplier now';
    }
    if (await saveChange(updated, 'SUPPLIER_DISABLED', details)) setStopMainDialog(null);
  };

  const restartSupplier = async (sup: ProductSupplier) => {
    await saveChange(withSupplier(sup.id, s => ({ ...s, isActive: true })), 'SUPPLIER_ENABLED', `${vendorName(sup.vendorId)} switched back on for this product`);
  };

  // Duplicate opens the Create Product form filled in from this product. Nothing is saved until the copy is saved.
  const handleDuplicate = () => navigate('/products', { state: { duplicateFrom: product.id } });

  // Suppliers only see linked products they supply themselves
  const relatedProducts = (product.relatedProductIds || [])
    .map((rid: string) => products.find(p => p.id === rid))
    .filter((p): p is Product => !!p && (!isSupplierRole || hasSupplier(p, mySupplierId)));
  const linkCandidates = products.filter(p => p.id !== product.id && !p.isArchived && !(product.relatedProductIds || []).includes(p.id));
  const perOrder = product.priceMode === 'PER_ORDER';

  // Last 10 deliveries, or all of them when extended history is shown
  const lastDeliveries = showAllDeliveries ? productDeliveries : productDeliveries.slice(0, 10);
  const sizeLabel = productSizeLabel(product);
  // The parent brand's optional short label shows under the name; disabled brands get a note
  const brandLabel = ctx.brands.find(b => b.id === product.brandParentId)?.label;
  const categoryName = productCategoryName(product, ctx.categories);
  const disabledBrands = disabledBrandNames(product, ctx.brands, ctx.brandSets);
  const activityShown = showAllActivity ? product.activity : product.activity.slice(0, 10);
  const btn = "flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm text-sm";
  const smallBtn = "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600";

  return (
    <div className="space-y-4 md:space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start md:items-center gap-3 md:gap-4">
          <button onClick={() => navigate('/products')} className="p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2}/></svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-black text-slate-900 leading-tight tracking-tight break-words">{product.title}</h1>
            {sizeLabel && <p className="text-slate-600 text-xs md:text-sm font-bold mt-1">{sizeLabel}</p>}
            {brandLabel && <p className="text-slate-500 text-xs md:text-sm font-bold mt-0.5">{brandLabel}</p>}
            <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">{categoryName ? `Category: ${categoryName} · ` : ''}Added: {product.dateAdded}</p>
          </div>
        </div>
        {(can.createProducts || can.editProductInfo || can.addPrices || can.archiveProducts || can.deleteProducts) && <div className="flex gap-2 md:gap-3 flex-wrap">
          {can.archiveProducts && !product.isArchived && (
            <button onClick={() => setLifecycleDialog('archive')} className={`${btn} hover:bg-slate-100`}>Archive</button>
          )}
          {can.archiveProducts && product.isArchived && (
            <button onClick={() => setLifecycleDialog('restore')} className={`${btn} hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700`}>Bring Back</button>
          )}
          {can.deleteProducts && !everOrdered && (
            <button onClick={() => setLifecycleDialog('delete')} className={`${btn} hover:bg-red-50 hover:border-red-300 hover:text-red-600`}>Delete</button>
          )}
          {can.createProducts && (
            <button onClick={handleDuplicate} className={`${btn} hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600`}>
              Duplicate
            </button>
          )}
          {can.editProductInfo && (
            <button onClick={() => setShowMetadataModal(true)} className={btn}>Edit Info</button>
          )}
          {can.addPrices && !perOrder && activeSuppliers(product).length > 0 && (
            <button onClick={() => setPriceDialog({})} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm">Add Price</button>
          )}
        </div>}
      </div>

      {disabledBrands.length > 0 && !isSupplierRole && (
        <div className="p-3 md:p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold">
          Includes a disabled brand: {disabledBrands.join(', ')}. It can still be ordered after a warning, but no new product can use this brand.
        </div>
      )}

      {product.isArchived && (
        <div className="p-3 md:p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-sm font-bold">
          Archived{product.archivedAt ? ` on ${product.archivedAt.slice(0, 10)}` : ''}{product.archivedBy ? ` by ${product.archivedBy}` : ''}. This product can't be added to orders. Its orders, deliveries, prices and history are kept.
        </div>
      )}

      {actionError && !dialogOpen && <div className={errorBoxCls}>{actionError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">

        {/* Left Column: Stats & Vendors */}
        <div className="space-y-4 md:space-y-8">
          {/* Linked Product Card */}
          <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 md:mb-6">Linked Product Family</h3>
            {relatedProducts.length > 0 ? (
              // BUG-283: a compact list, one row per linked product
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {relatedProducts.map(rp => {
                  const size = productSizeLabel(rp);
                  return (
                    <li key={rp.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 ${rp.isArchived ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <Link to={`/products/${rp.id}`} className="text-xs md:text-sm font-bold text-slate-900 hover:text-indigo-600 hover:underline break-words">{rp.title}</Link>
                        <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                          {productCategoryName(rp, ctx.categories)}{size ? ` · ${size}` : ''}
                          {rp.isArchived && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-widest text-[9px]">Archived</span>}
                        </div>
                      </div>
                      {can.manageLinks && (
                        <button onClick={() => removeLink(rp.id)} title="Remove this link from both products" className="text-[10px] font-black text-slate-400 hover:text-red-600 uppercase tracking-widest shrink-0 pt-0.5">Remove</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-4 md:py-6 px-4 bg-slate-50 rounded-2xl md:rounded-3xl border-2 border-dashed border-slate-200 text-center text-slate-400 text-xs italic">
                No related products linked (e.g. Inner Carton)
              </div>
            )}
            {can.manageLinks && (
              <LinkPicker candidates={linkCandidates} categories={ctx.categories} onConfirm={linkMany} />
            )}
          </div>

          {/* Current Pricing Card */}
          <div className="bg-indigo-600 p-5 md:p-8 rounded-2xl md:rounded-[40px] text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
             <div className="relative z-10">
                <h3 className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4 md:mb-8">{isSupplierRole ? 'Your Price Today' : 'Main Supplier Price Today'}</h3>
                {headline ? (
                  <>
                    {perOrder ? (
                      <div className="text-xl md:text-3xl font-black mb-1">Price set on each order</div>
                    ) : (
                    <div className="flex items-end gap-2 mb-1">
                      <span className="text-3xl md:text-5xl font-black">PKR {priceOn(headline, today).toFixed(2)}</span>
                      <span className="text-xs md:text-sm font-bold text-indigo-200 mb-0.5 md:mb-1">/ piece</span>
                    </div>
                    )}
                    <div className="text-[10px] md:text-xs font-bold text-indigo-100 uppercase tracking-widest truncate">{isSupplierRole ? vendorName(headline.vendorId) : `Main supplier: ${vendorName(headline.vendorId)}`}</div>
                  </>
                ) : (
                  <div className="text-sm font-bold text-indigo-100">Main supplier: none</div>
                )}

                {otherActive.length > 0 && (
                  <div className="mt-5 md:mt-8 pt-4 md:pt-6 border-t border-indigo-500/50 space-y-2">
                    <div className="text-[9px] md:text-[10px] text-indigo-200 font-black uppercase tracking-widest">{main ? 'Other Suppliers' : 'Suppliers'}</div>
                    {otherActive.map(s => (
                      <div key={s.id} className="flex justify-between gap-4">
                        <span className="text-xs font-bold truncate">{vendorName(s.vendorId)}</span>
                        <span className="text-sm font-black shrink-0">{perOrder ? 'On each order' : `PKR ${priceOn(s, today).toFixed(2)}`}</span>
                      </div>
                    ))}
                  </div>
                )}
             </div>
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
          </div>
        </div>

        {/* Middle/Right: Detailed History and Deliveries */}
        <div className="lg:col-span-2 space-y-4 md:space-y-8">

          {/* Suppliers and price history */}
          <div className="bg-white rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
               <div>
                 <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                   <Icons.Category /> {isSupplierRole ? 'Your Prices' : 'Suppliers and Prices'}
                 </h3>
                 <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">{perOrder
                   ? 'This product has no fixed price. The supplier\'s price is typed on each order line, and the order keeps it.'
                   : 'Each price is per piece and applies from its start date. Orders keep the price of the day they were placed.'}</p>
               </div>
               {can.addSuppliers && (
                 <button onClick={() => setSupplierDialog({})} className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest self-start sm:self-auto shrink-0">+ Add Supplier</button>
               )}
            </div>
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
               {shownSuppliers.map(sup => {
                  const history = sortPrices(sup.prices);
                  const current = priceRecordOn(sup, today);
                  const upcoming = history.filter(h => h.effectiveDate > today);
                  return (
                    <div key={sup.id} className={`space-y-3 md:space-y-4 ${!sup.isActive ? 'opacity-60' : ''}`}>
                       <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-900 truncate">{vendorName(sup.vendorId)}</div>
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {sup.isMain && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">Main</span>}
                              {!sup.isActive && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">Stopped</span>}
                              {upcoming.length > 0 && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">New price from {upcoming[upcoming.length - 1].effectiveDate}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Today</div>
                            <div className="text-sm font-black text-indigo-600">{perOrder ? 'Set on each order' : (current ? `PKR ${current.price.toFixed(2)}` : '--')}</div>
                          </div>
                       </div>
                       {can.manageSuppliers && (
                         <div className="flex gap-1.5 flex-wrap">
                           {sup.isActive && !sup.isMain && <button className={smallBtn} onClick={() => setMain(sup)}>Make main</button>}
                           {sup.isMain && <button className={smallBtn} onClick={() => setMain(null)}>Remove as main</button>}
                           {sup.isActive && <button className={smallBtn} onClick={() => sup.isMain ? setStopMainDialog(sup) : stopSupplier(sup, null)}>Stop</button>}
                           {!sup.isActive && <button className={smallBtn} onClick={() => restartSupplier(sup)}>Switch back on</button>}
                           {sup.isActive && <button className={smallBtn} onClick={() => setSupplierDialog({ replace: sup })}>Replace</button>}
                         </div>
                       )}
                       <div className={`bg-slate-50 rounded-2xl md:rounded-3xl p-3 md:p-4 space-y-2 md:space-y-3 ${perOrder ? 'hidden' : ''}`}>
                          {history.map(h => (
                            <div key={h.id}>
                              <div className="flex justify-between items-center gap-2">
                                 <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${h.id === current?.id ? 'bg-indigo-600' : h.effectiveDate > today ? 'bg-amber-400' : 'bg-slate-300'}`}></div>
                                    <span className="text-[10px] md:text-xs font-bold text-slate-600">From {h.effectiveDate}</span>
                                 </div>
                                 <span className="text-xs md:text-sm font-black text-slate-900">PKR {h.price.toFixed(2)}</span>
                              </div>
                              {(h.note || h.createdBy) && (
                                <div className="text-[10px] text-slate-400 ml-3.5">{h.note}{h.note && h.createdBy ? ' · ' : ''}{h.createdBy ? `by ${h.createdBy}` : ''}</div>
                              )}
                              {(can.correctPrices || can.deletePrices) && (
                                <div className="ml-3.5 mt-1 flex gap-3">
                                  {can.correctPrices && <button className="text-[10px] font-bold text-indigo-600 hover:underline" onClick={() => setPriceDialog({ vendorId: sup.vendorId, edit: h })}>Correct</button>}
                                  {can.deletePrices && <button className="text-[10px] font-bold text-red-500 hover:underline" onClick={() => setDeletePriceDialog({ supplier: sup, price: h })}>Delete</button>}
                                </div>
                              )}
                            </div>
                          ))}
                          {history.length === 0 && <div className="text-xs text-slate-400 italic py-2">No prices yet.</div>}
                       </div>
                    </div>
                  );
               })}
               {shownSuppliers.length === 0 && <div className="text-xs text-slate-400 italic">No suppliers yet.</div>}
            </div>
          </div>

          {/* Delivery Movement Audit */}
          <div className="bg-white rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
               <div>
                 <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                   <Icons.Delivery /> {showAllDeliveries ? `All Shipments (${productDeliveries.length})` : 'Last 10 Shipments'}
                 </h3>
                 <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">Physical inventory movement audit</p>
               </div>
               {productDeliveries.length > 10 && (
                 <button onClick={() => setShowAllDeliveries(v => !v)} className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest self-start sm:self-auto shrink-0">
                   {showAllDeliveries ? 'Show Last 10 Only' : 'Pull Extended History'}
                 </button>
               )}
            </div>

            {/* Mobile card view */}
            <div className="block md:hidden p-3 space-y-3">
              {lastDeliveries.map(d => {
                const delItem = d.items.find(i => i.productId === id);
                return (
                  <div key={d.id} className="bg-slate-50 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="text-sm font-bold text-slate-700">{d.deliveryDate}</div>
                      <span className="text-[10px] font-black bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">{d.challanNumber}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-slate-500">
                        {d.items.map(i => i.orderNumber).filter((v, idx, a) => a.indexOf(v) === idx).join(', ')}
                      </div>
                      <div className="text-sm font-black text-slate-900">Qty: {delItem?.quantity.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
              {lastDeliveries.length === 0 && (
                <div className="py-8 text-center text-slate-400 italic text-xs">No shipment records found for this product.</div>
              )}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-4 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Document</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Ref</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qty Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lastDeliveries.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="px-4 lg:px-8 py-4 lg:py-5 text-sm font-bold text-slate-700">{d.deliveryDate}</td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5">
                          <span className="text-xs font-black bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-sm">{d.challanNumber}</span>
                        </td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5 text-sm font-medium text-indigo-600">
                          {d.items.filter(i => i.productId === id).map(i => i.orderNumber).join(', ')}
                        </td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5 text-right font-black text-slate-900">
                          {d.items.find(i => i.productId === id)?.quantity.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {lastDeliveries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 lg:px-8 py-12 text-center text-slate-400 italic">No shipment records found for this product.</td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>
          </div>

          {/* Product activity log (not shown to vendors) */}
          {!isSupplierRole && (
            <div className="bg-white rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 md:p-8 border-b border-slate-50 bg-slate-50/30">
                <h3 className="text-base md:text-lg font-black text-slate-900">Activity</h3>
                <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">Every change to suppliers, prices, links and category on this product, with who made it</p>
              </div>
              <div className="p-4 md:p-8 space-y-3">
                {activityShown.map(a => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 border-b border-slate-50 pb-2">
                    <span className="text-sm text-slate-700">{a.details}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{new Date(a.at).toLocaleString()}{a.userName ? ` · ${a.userName}` : ''}</span>
                  </div>
                ))}
                {product.activity.length === 0 && <div className="text-xs text-slate-400 italic">No changes recorded yet.</div>}
                {product.activity.length > 10 && (
                  <button onClick={() => setShowAllActivity(v => !v)} className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest">
                    {showAllActivity ? 'Show latest 10 only' : `Show all ${product.activity.length}`}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Edit Metadata Modal */}
      {showMetadataModal && (
        <MetadataModal
          product={product}
          categories={ctx.categories}
          measuringUnits={measuringUnits}
          products={products}
          brands={ctx.brands}
          brandSets={ctx.brandSets}
          saveError={actionError}
          onClose={dismiss(() => setShowMetadataModal(false))}
          onSave={async (updates) => {
            const updated = { ...product, ...updates };
            const { error } = await db.upsertProduct(updated);
            if (error) {
              setActionError(notSavedMessage(error, 'The change'));
              return;
            }
            // A move to another category is recorded in the product's history (D38)
            const fromCat = categoryOf(product, ctx.categories);
            const toCat = categoryOf(updated, ctx.categories);
            if ((fromCat?.id || product.category) !== (toCat?.id || updated.category)) {
              await logActivity(updated, 'CATEGORY_CHANGED',
                `Moved from ${categoryFullName(fromCat) || product.category} to ${categoryFullName(toCat) || updated.category}`);
            } else {
              setProducts(prev => prev.map(p => p.id === id ? updated : p));
            }
            setShowMetadataModal(false);
          }}
        />
      )}

      {/* Add or correct a price */}
      {priceDialog && (
        <PriceModal
          suppliers={priceDialog.edit ? product.suppliers.filter(s => s.vendorId === priceDialog.vendorId) : activeSuppliers(product)}
          vendorName={vendorName}
          initialVendorId={priceDialog.vendorId || main?.vendorId}
          editing={priceDialog.edit}
          ordersAffected={(vendorId, fromDate) => orders.filter(o => o.vendorId === vendorId && o.date >= fromDate && o.items.some(i => i.productId === product.id)).length}
          saveError={actionError}
          onClose={dismiss(() => setPriceDialog(null))}
          onSave={async (vendorId, values) => {
            const sup = supplierOf(product, vendorId);
            if (!sup) return;
            const old = priceDialog.edit;
            if (old) {
              const updated = withSupplier(sup.id, s => ({ ...s, prices: s.prices.map(pr => pr.id === old.id ? { ...pr, ...values } : pr) }));
              const ok = await saveChange(updated, 'PRICE_EDITED',
                `${vendorName(vendorId)} price corrected: PKR ${old.price.toFixed(2)} from ${old.effectiveDate} is now PKR ${values.price.toFixed(2)} from ${values.effectiveDate}`);
              if (ok) setPriceDialog(null);
            } else {
              const entry: ProductPrice = { id: generateId(), ...values, createdBy: currentUser?.name, createdAt: new Date().toISOString() };
              const updated = withSupplier(sup.id, s => ({ ...s, prices: [...s.prices, entry] }));
              const ok = await saveChange(updated, 'PRICE_ADDED',
                `${vendorName(vendorId)} price PKR ${values.price.toFixed(2)} added, from ${values.effectiveDate}${values.note ? ` (${values.note})` : ''}`);
              if (ok) setPriceDialog(null);
            }
          }}
        />
      )}

      {/* Add or replace a supplier */}
      {supplierDialog && (
        <SupplierModal
          vendors={vendors.filter(v => !hasSupplier(product, v.id))}
          replacing={supplierDialog.replace ? vendorName(supplierDialog.replace.vendorId) : undefined}
          canSetMain={can.manageSuppliers && !supplierDialog.replace}
          noPrice={perOrder}
          saveError={actionError}
          onClose={dismiss(() => setSupplierDialog(null))}
          onSave={async (vendorId, values, makeMain) => {
            const now = new Date().toISOString();
            const old = supplierDialog.replace;
            const newSup: ProductSupplier = {
              id: generateId(),
              vendorId,
              isMain: old ? old.isMain : makeMain,
              isActive: true,
              addedBy: currentUser?.name,
              addedAt: now,
              prices: values ? [{ id: generateId(), ...values, createdBy: currentUser?.name, createdAt: now }] : [],
            };
            const suppliers = product.suppliers.map(s => {
              if (old && s.id === old.id) return { ...s, isActive: false, isMain: false };
              if (newSup.isMain) return { ...s, isMain: false };
              return s;
            });
            const updated: Product = { ...product, suppliers: [...suppliers, newSup] };
            const priceText = values ? `PKR ${values.price.toFixed(2)} from ${values.effectiveDate}` : 'price set on each order';
            const ok = old
              ? await saveChange(updated, 'SUPPLIER_REPLACED', `${vendorName(old.vendorId)} replaced by ${vendorName(vendorId)} (${priceText})${newSup.isMain ? '. It is now the main supplier' : ''}`)
              : await saveChange(updated, 'SUPPLIER_ADDED', `${vendorName(vendorId)} added as a supplier (${priceText})${newSup.isMain ? ' and set as main supplier' : ''}`);
            if (ok) setSupplierDialog(null);
          }}
        />
      )}

      {/* Stopping the main supplier: pick a new main, or none */}
      {stopMainDialog && (
        <StopMainModal
          supplierName={vendorName(stopMainDialog.vendorId)}
          others={activeSuppliers(product).filter(s => s.id !== stopMainDialog.id).map(s => ({ id: s.id, name: vendorName(s.vendorId) }))}
          saveError={actionError}
          onClose={dismiss(() => setStopMainDialog(null))}
          onConfirm={newMainId => stopSupplier(stopMainDialog, newMainId)}
        />
      )}

      {/* Archive, bring back or delete the product (Super Admin) */}
      {lifecycleDialog === 'archive' && (
        <ConfirmModal
          title="Archive this product?"
          message="It stays in the product list, greyed out, and its orders, deliveries, prices and history are kept. It can't be added to new orders. Orders already open finish normally. You can bring it back at any time."
          confirmLabel={lifecycleBusy ? 'Archiving...' : 'Archive'}
          saveError={actionError}
          onClose={dismiss(() => setLifecycleDialog(null))}
          onConfirm={() => { if (!lifecycleBusy) setArchived(true); }}
        />
      )}
      {lifecycleDialog === 'restore' && (
        <ConfirmModal
          title="Bring this product back?"
          message="It will be available for orders again."
          confirmLabel={lifecycleBusy ? 'Saving...' : 'Bring back'}
          saveError={actionError}
          onClose={dismiss(() => setLifecycleDialog(null))}
          onConfirm={() => { if (!lifecycleBusy) setArchived(false); }}
        />
      )}
      {lifecycleDialog === 'delete' && (
        <ConfirmModal
          title="Delete this product?"
          message={everOrdered
            ? 'This product has been ordered, so it cannot be deleted. Archive it instead.'
            : `"${product.title}" has never been ordered. It will be removed completely, with its suppliers, prices and activity. This cannot be undone.`}
          confirmLabel={everOrdered ? undefined : (lifecycleBusy ? 'Deleting...' : 'Delete product')}
          saveError={actionError}
          onClose={dismiss(() => setLifecycleDialog(null))}
          onConfirm={() => { if (!lifecycleBusy) deleteProduct(); }}
        />
      )}

      {/* Delete a wrong price entry (Super Admin) */}
      {deletePriceDialog && (
        <ConfirmModal
          title="Delete this price?"
          message={deletePriceDialog.supplier.prices.length <= 1
            ? 'This is the only price for this supplier, so it cannot be deleted. Correct it instead.'
            : `PKR ${deletePriceDialog.price.price.toFixed(2)} from ${deletePriceDialog.price.effectiveDate} for ${vendorName(deletePriceDialog.supplier.vendorId)} will be removed. Orders already placed keep their price.`}
          confirmLabel={deletePriceDialog.supplier.prices.length <= 1 ? undefined : 'Delete price'}
          saveError={actionError}
          onClose={dismiss(() => setDeletePriceDialog(null))}
          onConfirm={async () => {
            const { supplier, price } = deletePriceDialog;
            const { error } = await db.deleteProductPrice(price.id);
            if (error) {
              setActionError(notSavedMessage(error, 'The price', 'deleted'));
              return;
            }
            const updated = withSupplier(supplier.id, s => ({ ...s, prices: s.prices.filter(pr => pr.id !== price.id) }));
            const ok = await saveChange(updated, 'PRICE_DELETED', `${vendorName(supplier.vendorId)} price PKR ${price.price.toFixed(2)} from ${price.effectiveDate} deleted`);
            if (ok) setDeletePriceDialog(null);
          }}
        />
      )}
    </div>
  );
};

// Metadata Edit Modal Component
const MetadataModal: React.FC<{
  product: any;
  categories: Category[];
  measuringUnits: any[];
  products: any[];
  onClose: () => void;
  onSave: (updates: any) => void;
  requireChange?: boolean;
  brands: Brand[];
  brandSets: BrandSet[];
  saveError?: string;
}> = ({ product, categories, measuringUnits, products, onClose, onSave, requireChange = false, brands, brandSets, saveError }) => {
  // A product's brand is locked after creation (agreed 12 Nov 2026): change it by duplicating
  const brandParts = productBrandParts(product, brands, brandSets);
  const fe = useFieldErrors();
  const [formData, setFormData] = useState({
    category: product.category,
    itemName: product.itemName,
    description: product.description || '',
    unitSize: product.unitSize,
    measuringUnit: product.measuringUnit || '',
    packing: product.packing,
    itemCapacity: product.itemCapacity !== undefined && product.itemCapacity !== null ? String(product.itemCapacity) : '',
    itemCapacityUnit: product.itemCapacityUnit || '',
  });
  const generatedTitle = useMemo(() => {
    return buildProductTitle(formData.category, brandParts.parentName, brandParts.childNames, formData.itemName, contentsPart(formData.itemCapacity, formData.itemCapacityUnit, formData.packing));
  }, [formData, brandParts.parentName, brandParts.childNames.join(',')]);

  const isDirty = useMemo(() => {
    if (!requireChange) return true;
    const fieldChanged = (
      formData.category !== product.category ||
      formData.itemName !== product.itemName ||
      formData.description !== (product.description || '') ||
      formData.unitSize !== product.unitSize ||
      formData.measuringUnit !== (product.measuringUnit || '') ||
      formData.packing !== product.packing ||
      formData.itemCapacity !== (product.itemCapacity !== undefined && product.itemCapacity !== null ? String(product.itemCapacity) : '') ||
      formData.itemCapacityUnit !== (product.itemCapacityUnit || '')
    );
    return fieldChanged;
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty) return;
    // D39: outline each field that blocks saving and move the cursor to the first
    const errs: FieldErrors = {};
    if (!(formData.itemName || '').trim()) {
      errs.itemName = 'Enter the item name.';
    } else {
      const sameName = products.find((p: any) => p.id !== product.id && p.title.trim().toLowerCase() === generatedTitle.trim().toLowerCase());
      if (sameName) errs.itemName = `Another product already has this name: "${sameName.title}". Change the item name, e.g. add "Large".`;
    }
    // D42: size is optional; a capacity must be a number above 0 and needs its unit
    if (formData.itemCapacity.trim() !== '') {
      const cap = parseFloat(formData.itemCapacity);
      if (isNaN(cap) || cap <= 0) errs.itemCapacity = 'Enter a capacity above 0, e.g. 30.';
      else if (!formData.itemCapacityUnit) errs.itemCapacityUnit = 'Choose the unit, e.g. ML.';
    }
    if (fe.show(errs)) return;
    // Linked products are managed on the product page, not here
    const hasCapacity = formData.itemCapacity.trim() !== '';
    onSave({
      ...formData,
      // D42: stored as a number, or nothing when left empty
      itemCapacity: hasCapacity ? parseFloat(formData.itemCapacity) : undefined,
      itemCapacityUnit: hasCapacity ? formData.itemCapacityUnit : undefined,
      title: generatedTitle,
      categoryId: categories.find(c => c.name === formData.category)?.id,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 max-h-[95vh] flex flex-col">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg md:text-2xl font-black text-slate-900">Edit Product Metadata</h2>
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Update product specifications</p>
          </div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
            <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-4 md:p-10 overflow-y-auto space-y-4 md:space-y-6 flex-1">
          <div className="bg-indigo-600 p-4 md:p-6 rounded-2xl md:rounded-[24px] text-white shadow-lg">
            <div className="text-[9px] md:text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Display Name Preview</div>
            <div className="text-sm md:text-lg font-black leading-tight break-words">{generatedTitle || 'Awaiting Input...'}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Brand (locked)</label>
              <div className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-100 font-bold text-sm text-slate-600">{entryText(brandParts.parentName, brandParts.childNames) || '--'}</div>
              <p className="text-[11px] text-slate-400 mt-1">To use a different brand, duplicate the product.</p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Category*</label>
              <select name="category" value={formData.category} onChange={handleChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required>
                {!categories.some(c => c.name === formData.category) && <option value={formData.category}>{formData.category}</option>}
                {sortCategories(categories).map(cat => (
                  <option key={cat.id} value={cat.name}>{categoryLabel(cat)}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                {categories.find(c => c.name === formData.category)?.shortCode ? `Short code: ${categories.find(c => c.name === formData.category)?.shortCode}. ` : ''}
                {formData.category !== product.category ? 'Moving it to another category is recorded in the product history.' : 'You can move the product to another category at any time.'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Name*</label>
              <input name="itemName" value={formData.itemName} onChange={handleChange} type="text" {...fe.field('itemName', "w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} />
              <FieldMessage msg={fe.errors.itemName} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
              <input name="description" value={formData.description} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Size (L × W × H)</label>
              <div className="flex gap-2">
                <input name="unitSize" value={formData.unitSize} onChange={handleChange} type="text" {...fe.field('unitSize', "flex-1 min-w-0 px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="Optional, e.g. 11 x 11.5 x 13" />
                <select name="measuringUnit" value={formData.measuringUnit} onChange={handleChange} className="w-20 md:w-24 px-2 md:px-3 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                  <option value="">Unit</option>
                  {measuringUnits.map((u: any) => (
                    <option key={u.id} value={u.symbol}>{u.symbol}</option>
                  ))}
                </select>
              </div>
              <FieldMessage msg={fe.errors.unitSize} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item capacity</label>
              <div className="flex gap-2">
                <input name="itemCapacity" value={formData.itemCapacity} onChange={handleChange} type="number" step="any" min="0" {...fe.field('itemCapacity', "flex-1 min-w-0 px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="Optional, e.g. 30" />
                <select name="itemCapacityUnit" value={formData.itemCapacityUnit} onChange={handleChange} {...fe.field('itemCapacityUnit', "w-20 md:w-24 px-2 md:px-3 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")}>
                  <option value="">Unit</option>
                  {measuringUnits.map((u: any) => (
                    <option key={u.id} value={u.symbol}>{u.symbol}</option>
                  ))}
                </select>
              </div>
              <FieldMessage msg={fe.errors.itemCapacity || fe.errors.itemCapacityUnit} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Packing</label>
              <input name="packing" value={formData.packing} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="Optional, e.g. 26 Pcs or 24 Bottles" />
            </div>
          </div>

          <ErrorBox msg={saveError} />

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 md:pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]">Cancel</button>
            <button type="submit" disabled={!isDirty} className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const inputCls = "w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm";
const labelCls = "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2";
const cancelCls = "px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]";
const saveCls = "px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] disabled:opacity-50";

type PriceValues = { price: number; effectiveDate: string; note?: string };

const ModalShell: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
    <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-200 max-h-[95vh] overflow-y-auto">
      <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-lg md:text-2xl font-black text-slate-900">{title}</h2>
          {subtitle && <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
          <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="p-4 md:p-8 space-y-4 md:space-y-6">{children}</div>
    </div>
  </div>
);

// Price, start date and note fields, shared by the price and supplier dialogs
const PriceFields: React.FC<{ price: string; date: string; note: string; setPrice: (v: string) => void; setDate: (v: string) => void; setNote: (v: string) => void; fe: ReturnType<typeof useFieldErrors> }> =
  ({ price, date, note, setPrice, setDate, setNote, fe }) => (
  <>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Price per piece (PKR)*</label>
        <input type="number" step="0.001" min="0" value={price} onChange={e => setPrice(e.target.value)} {...fe.field('price', inputCls)} placeholder="0.00" />
        <FieldMessage msg={fe.errors.price} />
      </div>
      <div>
        <label className={labelCls}>Starts on*</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} {...fe.field('date', inputCls)} />
        <FieldMessage msg={fe.errors.date} />
      </div>
    </div>
    <div>
      <label className={labelCls}>Note</label>
      <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="Optional, e.g. Rate revised by vendor letter" />
    </div>
  </>
);

// D39: the price and date problems, one per field
const priceErrors = (price: string, date: string): FieldErrors => {
  const errs: FieldErrors = {};
  const n = parseFloat(price);
  if (price === '') errs.price = 'Enter the price.';
  else if (isNaN(n) || n < 0) errs.price = 'Enter a price of 0 or more.';
  if (!date) errs.date = 'Choose the date this price starts.';
  return errs;
};

const readPrice = (price: string, date: string, note: string): PriceValues =>
  ({ price: parseFloat(price), effectiveDate: date, note: note.trim() || undefined });

// Add a new price (or correct an existing one), with a warning for past start dates
const PriceModal: React.FC<{
  suppliers: ProductSupplier[];
  vendorName: (id?: string) => string;
  initialVendorId?: string;
  editing?: ProductPrice;
  ordersAffected: (vendorId: string, fromDate: string) => number;
  onClose: () => void;
  onSave: (vendorId: string, values: PriceValues) => Promise<void>;
  saveError?: string;
}> = ({ suppliers, vendorName, initialVendorId, editing, ordersAffected, onClose, onSave, saveError }) => {
  const [vendorId, setVendorId] = useState(initialVendorId && suppliers.some(s => s.vendorId === initialVendorId) ? initialVendorId : suppliers[0]?.vendorId || '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [date, setDate] = useState(editing ? editing.effectiveDate : localToday());
  const [note, setNote] = useState(editing?.note || '');
  const fe = useFieldErrors();
  const [confirmPast, setConfirmPast] = useState<{ values: PriceValues; count: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const current = priceRecordOn(suppliers.find(s => s.vendorId === vendorId));

  const save = async (values: PriceValues) => {
    setSaving(true);
    await onSave(vendorId, values);
    setSaving(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fe.show(priceErrors(price, date))) return;
    const values = readPrice(price, date, note);
    if (values.effectiveDate < localToday()) {
      setConfirmPast({ values, count: ordersAffected(vendorId, values.effectiveDate) });
      return;
    }
    save(values);
  };

  if (confirmPast) {
    return (
      <ModalShell title="Price starts in the past" onClose={onClose}>
        <div className="p-4 rounded-2xl bg-amber-50 text-amber-800 text-sm font-medium space-y-2">
          <p>This price starts on {confirmPast.values.effectiveDate}, which is in the past.</p>
          <p>Orders already placed keep the price they were placed at. <b>{confirmPast.count} order{confirmPast.count === 1 ? '' : 's'}</b> with {vendorName(vendorId)} for this product since that date will not change.</p>
        </div>
        <ErrorBox msg={saveError} />
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
          <button type="button" onClick={() => setConfirmPast(null)} className={cancelCls}>Go back</button>
          <button type="button" disabled={saving} onClick={() => save(confirmPast.values)} className={saveCls}>{saving ? 'Saving...' : 'Save price'}</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={editing ? 'Correct a Price' : 'Add a Price'} subtitle={editing ? 'The change is recorded in the history' : 'New price for one supplier'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4 md:space-y-6">
        <div>
          <label className={labelCls}>Supplier*</label>
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} disabled={!!editing} className={inputCls}>
            {suppliers.map(s => <option key={s.id} value={s.vendorId}>{vendorName(s.vendorId)}{s.isMain ? ' (Main)' : ''}</option>)}
          </select>
        </div>
        {!editing && (
          <div className="bg-slate-50 p-4 rounded-xl md:rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Price today</div>
            <div className="text-2xl font-black text-slate-900">{current ? `PKR ${current.price.toFixed(2)}` : '--'}</div>
          </div>
        )}
        <PriceFields price={price} date={date} note={note} setPrice={setPrice} setDate={setDate} setNote={setNote} fe={fe} />
        <ErrorBox msg={saveError} />
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className={cancelCls}>Cancel</button>
          <button type="submit" disabled={saving} className={saveCls}>{saving ? 'Saving...' : editing ? 'Save correction' : 'Add price'}</button>
        </div>
      </form>
    </ModalShell>
  );
};

// Add a supplier to the product, or replace an existing one
const SupplierModal: React.FC<{
  vendors: { id: string; name: string }[];
  replacing?: string;
  canSetMain: boolean;
  noPrice?: boolean; // "price set on each order" products: no price is asked
  onClose: () => void;
  onSave: (vendorId: string, values: PriceValues | null, makeMain: boolean) => Promise<void>;
  saveError?: string;
}> = ({ vendors, replacing, canSetMain, noPrice = false, onClose, onSave, saveError }) => {
  const [vendorId, setVendorId] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [makeMain, setMakeMain] = useState(false);
  const fe = useFieldErrors();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: FieldErrors = noPrice ? {} : priceErrors(price, date);
    if (!vendorId) errs.vendor = 'Choose a supplier.';
    if (fe.show(errs)) return;
    const values = noPrice ? null : readPrice(price, date, note);
    setSaving(true);
    await onSave(vendorId, values, makeMain);
    setSaving(false);
  };

  return (
    <ModalShell title={replacing ? 'Replace Supplier' : 'Add Supplier'} subtitle={replacing ? `${replacing} will be stopped for this product` : (noPrice ? 'Price is set on each order' : 'With its first price')} onClose={onClose}>
      {vendors.length === 0 ? (
        <p className="text-sm text-slate-500">Every supplier is already linked to this product.</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 md:space-y-6">
          <div>
            <label className={labelCls}>Supplier*</label>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)} {...fe.field('vendor', inputCls)}>
              <option value="">-- Choose Supplier --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <FieldMessage msg={fe.errors.vendor} />
          </div>
          {!noPrice && <PriceFields price={price} date={date} note={note} setPrice={setPrice} setDate={setDate} setNote={setNote} fe={fe} />}
          {canSetMain && (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <input type="checkbox" checked={makeMain} onChange={e => setMakeMain(e.target.checked)} /> Make this the main supplier
            </label>
          )}
          <ErrorBox msg={saveError} />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={cancelCls}>Cancel</button>
            <button type="submit" disabled={saving} className={saveCls}>{saving ? 'Saving...' : replacing ? 'Replace' : 'Add supplier'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
};

// Stopping the main supplier asks for a new main supplier, or none
const StopMainModal: React.FC<{
  supplierName: string;
  others: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (newMainId: string | null) => void;
  saveError?: string;
}> = ({ supplierName, others, onClose, onConfirm, saveError }) => {
  const [choice, setChoice] = useState('');
  return (
    <ModalShell title="Stop the main supplier" onClose={onClose}>
      <p className="text-sm text-slate-600">{supplierName} is the main supplier. Choose a new main supplier, or none.</p>
      <select value={choice} onChange={e => setChoice(e.target.value)} className={inputCls}>
        <option value="">No main supplier</option>
        {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <ErrorBox msg={saveError} />
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className={cancelCls}>Cancel</button>
        <button type="button" onClick={() => onConfirm(choice || null)} className={saveCls}>Stop supplier</button>
      </div>
    </ModalShell>
  );
};

const ConfirmModal: React.FC<{ title: string; message: string; confirmLabel?: string; onClose: () => void; onConfirm: () => void; saveError?: string }> =
  ({ title, message, confirmLabel, onClose, onConfirm, saveError }) => (
  <ModalShell title={title} onClose={onClose}>
    <p className="text-sm text-slate-600">{message}</p>
    <ErrorBox msg={saveError} />
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
      <button type="button" onClick={onClose} className={cancelCls}>{confirmLabel ? 'Cancel' : 'Close'}</button>
      {confirmLabel && <button type="button" onClick={onConfirm} className="px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-red-600 hover:bg-red-700 uppercase tracking-widest text-[10px]">{confirmLabel}</button>}
    </div>
  </ModalShell>
);

export default ProductDetail;
