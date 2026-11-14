
import React, { useContext, useState, useEffect, useMemo } from 'react';
import { CRMContext, generateId } from '../App';
import { Product, ProductActivity, ProductSupplier, UserRole } from '../types';
import { Icons } from '../constants';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { localToday, mainSupplier, activeSuppliers, orderedSuppliers, priceOn, sortPrices, hasSupplier, deliveryLine } from '../services/pricing';
import { productPermissions } from '../services/permissions';
import { brandEntries, entryKey, entryText, buildProductTitle, contentsPart, productBrandParts, setChildNames, parentBrands, childBrandsOf } from '../services/brands';
import { sortCategories, categoryLabel } from '../services/categories';
import { useFieldErrors, FieldErrors } from '../services/formErrors';
import FieldMessage from '../components/FieldMessage';
import LinkPicker from '../components/LinkPicker';

// The brand picked on the form is one entry: "parentId" (parent alone) or "parentId|setId" (a brand set)
const splitEntry = (key: string) => { const [parentId, setId] = key.split('|'); return { parentId: parentId || undefined, setId: setId || undefined }; };

// One supplier on the Create Product form, with one or more dated prices
type SupplierDraft = { vendorId: string; prices: { price: string; effectiveDate: string; note: string }[] };
const emptyPriceRow = () => ({ price: '', effectiveDate: localToday(), note: '' });
const emptySupplierDraft = (): SupplierDraft => ({ vendorId: '', prices: [emptyPriceRow()] });
// "[COPY]" is added to a copy's description as a reminder (saving is allowed without removing it)
const withCopyTag = (desc?: string) => (desc || '').includes('[COPY]') ? (desc || '') : (desc ? `${desc} [COPY]` : '[COPY]');
const withoutCopyTag = (desc?: string) => (desc || '').replace(/\s*\[COPY\]\s*/g, ' ').trim();

const Products: React.FC = () => {
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Filter states
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  // '' = all products (archived ones shown greyed), 'active', 'archived'
  const [filterArchive, setFilterArchive] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    brand: '',
    category: '',
    itemName: '',
    description: '',
    unitSize: '',
    measuringUnit: '',
    packing: '',
    itemCapacity: '',
    itemCapacityUnit: '',
    relatedProductId: '',
  });
  const [supplierDrafts, setSupplierDrafts] = useState<SupplierDraft[]>([emptySupplierDraft()]);
  const [mainVendorId, setMainVendorId] = useState('');
  const [formError, setFormError] = useState('');
  const fe = useFieldErrors();
  const [saving, setSaving] = useState(false);

  // Duplicate mode: the form is filled in from an existing product
  const [duplicateOf, setDuplicateOf] = useState<Product | null>(null);
  const [copyLinks, setCopyLinks] = useState<string[]>([]);
  const [whatsDifferent, setWhatsDifferent] = useState('');
  const [priceWarning, setPriceWarning] = useState('');
  // "Price set on each order": no price is asked when the product is created
  const [perOrderMode, setPerOrderMode] = useState(false);
  const [pageNotice, setPageNotice] = useState('');

  const [filterBrand, setFilterBrand] = useState(''); // 'p:<parentId>' or 'c:<childId>'

  // Name = Category + Parent brand + [child brands A-Z] + Item name + Packing (agreed 12 Nov 2026)
  const generatedTitle = useMemo(() => {
    const { parentId, setId } = splitEntry(formData.brand);
    const parentName = ctx?.brands.find(b => b.id === parentId)?.name || '';
    const childNames = setChildNames(ctx?.brandSets.find(s => s.id === setId), ctx?.brands || []);
    return buildProductTitle(formData.category, parentName, childNames, formData.itemName, contentsPart(formData.itemCapacity, formData.itemCapacityUnit, formData.packing));
  }, [formData, ctx?.brands, ctx?.brandSets]);

  useEffect(() => {
    const categories = ctx?.categories || [];
    if (showAddModal && categories.length > 0 && !formData.category) {
      setFormData(prev => ({ ...prev, category: sortCategories(categories)[0].name }));
    }
  }, [showAddModal, ctx?.categories]);

  // Opened from a product's Duplicate button: fill the form from that product
  useEffect(() => {
    const sourceId = (location.state as any)?.duplicateFrom;
    if (!sourceId || !ctx) return;
    const original = ctx.products.find(p => p.id === sourceId);
    // Clear the request so a page refresh or going back does not open the form again
    navigate(location.pathname, { replace: true, state: null });
    if (!original || !productPermissions(ctx.currentUser).createProducts) return;
    const today = localToday();
    setFormData({
      brand: entryKey(original.brandParentId, original.brandSetId),
      category: original.category,
      itemName: original.itemName,
      description: withCopyTag(original.description),
      unitSize: original.unitSize || '',
      measuringUnit: original.measuringUnit || '',
      packing: original.packing || '',
      itemCapacity: original.itemCapacity !== undefined ? String(original.itemCapacity) : '',
      itemCapacityUnit: original.itemCapacityUnit || '',
      relatedProductId: '',
    });
    // Same suppliers (stopped ones are left out) with today's price filled in, no price history.
    // "Price set on each order" products have no prices to fill in.
    const isPerOrder = original.priceMode === 'PER_ORDER';
    setPerOrderMode(isPerOrder);
    const active = activeSuppliers(original);
    setSupplierDrafts(active.length > 0
      ? active.map(s => ({ vendorId: s.vendorId, prices: isPerOrder ? [emptyPriceRow()] : [{ price: String(priceOn(s, today)), effectiveDate: today, note: '' }] }))
      : [emptySupplierDraft()]);
    setMainVendorId(mainSupplier(original)?.isActive ? mainSupplier(original)!.vendorId : '');
    // Linked to the original and to everything the original is linked to
    setCopyLinks([original.id, ...(original.relatedProductIds || []).filter(id => id !== original.id && ctx.products.some(p => p.id === id))]);
    setWhatsDifferent('');
    setPriceWarning('');
    setFormError('');
    fe.reset();
    setDuplicateOf(original);
    setShowAddModal(true);
  }, [location.state, ctx?.products]);

  if (!ctx) return null;
  const { products, setProducts, vendors, currentUser, categories, measuringUnits, deliveries } = ctx;

  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const isSupplierRole = isVendor || isVendorStaff;
  const can = productPermissions(currentUser);
  const mySupplierId = currentUser?.vendorId;

  // Vendors only see products they supply, and only their own price
  const baseProducts = isSupplierRole
    ? products.filter(p => hasSupplier(p, mySupplierId))
    : products;
  const visibleSuppliers = (p: Product) =>
    isSupplierRole ? p.suppliers.filter(s => s.vendorId === mySupplierId) : orderedSuppliers(p);

  const { brands, brandSets } = ctx;
  const filtered = baseProducts.filter(p => {
    const q = searchTerm.toLowerCase();
    const label = brands.find(b => b.id === p.brandParentId)?.label || '';
    const matchesSearch = p.title.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || label.toLowerCase().includes(q);
    const matchesCategory = !filterCategory || p.category === filterCategory;
    const matchesVendor = !filterVendor || hasSupplier(p, filterVendor);
    const matchesArchive = !filterArchive || (filterArchive === 'archived' ? !!p.isArchived : !p.isArchived);
    // Brand filter: a parent brand (all its products) or any single child brand (products whose set includes it)
    const matchesBrand = !filterBrand ||
      (filterBrand.startsWith('p:') && p.brandParentId === filterBrand.slice(2)) ||
      (filterBrand.startsWith('c:') && !!brandSets.find(s => s.id === p.brandSetId)?.childIds.includes(filterBrand.slice(2)));
    return matchesSearch && matchesCategory && matchesVendor && matchesArchive && matchesBrand;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const updateSupplierDraft = (idx: number, change: (d: SupplierDraft) => SupplierDraft) => {
    setPriceWarning('');
    setSupplierDrafts(prev => prev.map((d, i) => i === idx ? change(d) : d));
  };

  const resetForm = () => {
    setFormData({
      brand: '',
      category: sortCategories(categories)[0]?.name || '',
      itemName: '',
      description: '',
      unitSize: '',
      measuringUnit: '',
      packing: '',
      itemCapacity: '',
      itemCapacityUnit: '',
      relatedProductId: '',
    });
    setSupplierDrafts([emptySupplierDraft()]);
    setMainVendorId('');
    setFormError('');
    fe.reset();
    setDuplicateOf(null);
    setCopyLinks([]);
    setWhatsDifferent('');
    setPriceWarning('');
    setPerOrderMode(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    // D39: check every field, outline each one that blocks saving, and move the cursor to the first
    const errs: FieldErrors = {};
    if (!formData.brand) {
      errs.brand = 'Choose a brand or brand set.';
    } else {
      // Only brands that are switched on can be used for a new product
      const pickedEntry = brandEntries(brands, brandSets).find(e => e.key === formData.brand);
      if (!pickedEntry || !pickedEntry.usable) errs.brand = 'This brand is disabled or no longer exists. Pick another one.';
    }
    if (!formData.itemName.trim()) {
      errs.itemName = 'Enter the item name.';
    } else {
      // No two products with the same name (agreed 1 Nov 2026)
      const sameName = products.find(p => p.title.trim().toLowerCase() === generatedTitle.trim().toLowerCase());
      if (sameName) errs.itemName = `Another product already has this name: "${sameName.title}". Change the item name, e.g. add "Large".`;
    }
    // D42: size is optional; a capacity must be a number above 0 and needs its unit
    if (formData.itemCapacity.trim() !== '') {
      const cap = parseFloat(formData.itemCapacity);
      if (isNaN(cap) || cap <= 0) errs.itemCapacity = 'Enter a capacity above 0, e.g. 30.';
      else if (!formData.itemCapacityUnit) errs.itemCapacityUnit = 'Choose the unit, e.g. ML.';
    }
    if (duplicateOf && !whatsDifferent.trim()) errs.whatsDifferent = "Write what's different from the original.";
    const drafts = supplierDrafts.filter(d => d.vendorId);
    if (drafts.length === 0) {
      errs['supplier-0'] = perOrderMode ? 'Choose at least one supplier.' : 'Choose at least one supplier and give it a price.';
    }
    // "Price set on each order" products have no prices to check
    if (!perOrderMode) {
      supplierDrafts.forEach((d, idx) => {
        if (!d.vendorId) return;
        if (!d.prices.some(r => r.price !== '')) errs[`price-${idx}-0`] = 'Enter a price for this supplier.';
        d.prices.forEach((r, pIdx) => {
          if (r.price === '') return;
          if (isNaN(parseFloat(r.price)) || parseFloat(r.price) < 0) errs[`price-${idx}-${pIdx}`] = 'Enter a price of 0 or more.';
          if (!r.effectiveDate) errs[`date-${idx}-${pIdx}`] = 'Choose the start date.';
        });
      });
    }
    if (fe.show(errs)) {
      setFormError('Not saved yet: please fix the fields outlined in red.');
      return;
    }

    const today = localToday();
    const nameOf = (vendorId: string) => vendors.find(v => v.id === vendorId)?.name || 'supplier';

    // Extra rules for a copy (agreed 1 Nov 2026)
    if (duplicateOf) {
      const originalPrice = (vendorId: string) => {
        const s = activeSuppliers(duplicateOf).find(x => x.vendorId === vendorId);
        return s ? priceOn(s, today) : undefined;
      };
      const infoChanged =
        formData.brand !== entryKey(duplicateOf.brandParentId, duplicateOf.brandSetId) ||
        formData.category !== duplicateOf.category ||
        formData.itemName !== duplicateOf.itemName ||
        withoutCopyTag(formData.description) !== withoutCopyTag(duplicateOf.description) ||
        formData.unitSize !== (duplicateOf.unitSize || '') ||
        formData.measuringUnit !== (duplicateOf.measuringUnit || '') ||
        formData.packing !== (duplicateOf.packing || '') ||
        formData.itemCapacity !== (duplicateOf.itemCapacity !== undefined ? String(duplicateOf.itemCapacity) : '') ||
        formData.itemCapacityUnit !== (duplicateOf.itemCapacityUnit || '');
      const originalVendors = activeSuppliers(duplicateOf).map(s => s.vendorId).sort().join(',');
      const suppliersChanged = drafts.map(d => d.vendorId).sort().join(',') !== originalVendors ||
        mainVendorId !== (mainSupplier(duplicateOf)?.isActive ? mainSupplier(duplicateOf)!.vendorId : '');
      const modeChanged = perOrderMode !== (duplicateOf.priceMode === 'PER_ORDER');
      const pricesChanged = !perOrderMode && drafts.some(d => {
        const rows = d.prices.filter(r => r.price !== '');
        return rows.length !== 1 || parseFloat(rows[0].price) !== originalPrice(d.vendorId);
      });
      if (!infoChanged && !suppliersChanged && !pricesChanged && !modeChanged) {
        setFormError('Nothing is different from the original yet. Change at least one detail or price before saving.');
        return;
      }
      // Warn once if a price is the same as the original's; saving again continues
      const samePrice = perOrderMode ? [] : drafts.filter(d => d.prices.some(r => r.price !== '' && parseFloat(r.price) === originalPrice(d.vendorId)));
      if (samePrice.length > 0 && !priceWarning) {
        setPriceWarning(`These prices are the same as the original: ${samePrice.map(d => `${nameOf(d.vendorId)} PKR ${originalPrice(d.vendorId)!.toFixed(2)}`).join(', ')}. Check them, or press Save Copy again to keep them.`);
        return;
      }
    }

    const now = new Date().toISOString();
    const productId = generateId();
    const suppliers: ProductSupplier[] = drafts.map(d => ({
      id: generateId(),
      vendorId: d.vendorId,
      isMain: d.vendorId === mainVendorId,
      isActive: true,
      addedBy: currentUser?.name,
      addedAt: now,
      prices: perOrderMode ? [] : d.prices.filter(r => r.price !== '').map(r => ({
        id: generateId(),
        price: parseFloat(r.price),
        effectiveDate: r.effectiveDate,
        note: r.note.trim() || undefined,
        createdBy: currentUser?.name,
        createdAt: now,
      })),
    }));

    const picked = splitEntry(formData.brand);
    const newProduct: Product = {
      id: productId,
      title: generatedTitle,
      // The old typed-brand column keeps the parent's name, so a rollback still shows a brand
      brand: brands.find(b => b.id === picked.parentId)?.name || '',
      brandParentId: picked.parentId,
      brandSetId: picked.setId,
      category: formData.category,
      categoryId: categories.find(c => c.name === formData.category)?.id,
      itemName: formData.itemName,
      description: formData.description,
      unitSize: formData.unitSize,
      measuringUnit: formData.measuringUnit,
      packing: formData.packing,
      itemCapacity: formData.itemCapacity.trim() !== '' ? parseFloat(formData.itemCapacity) : undefined,
      itemCapacityUnit: formData.itemCapacity.trim() !== '' ? formData.itemCapacityUnit : undefined,
      suppliers,
      activity: [],
      dateAdded: today,
      relatedProductIds: copyLinks,
      priceMode: perOrderMode ? 'PER_ORDER' : 'LIST',
    };

    setSaving(true);
    const { error } = await db.saveProductWithSuppliers(newProduct);
    if (error) {
      setSaving(false);
      setFormError(`The product was not saved: ${error.message}`);
      return;
    }

    // Two-way links: each linked product also lists the new product, and records it in its history
    const titleOf = (pid: string) => products.find(p => p.id === pid)?.title || 'a deleted product';
    const otherUpdates: Record<string, Product> = {};
    let linkProblem = '';
    if (copyLinks.length > 0) {
      const linkRes = await db.addProductLinks(productId, copyLinks, currentUser?.name);
      if (linkRes.error) {
        linkProblem = `The product was saved, but its links were not: ${linkRes.error.message}`;
        newProduct.relatedProductIds = [];
      } else {
        for (const oid of copyLinks) {
          const other = products.find(p => p.id === oid);
          if (!other) continue;
          const theirs = [...(other.relatedProductIds || []).filter(x => x !== productId), productId];
          await db.setRelatedMirror(oid, theirs);
          const otherEntry: ProductActivity = {
            id: generateId(), productId: oid, type: 'LINK_ADDED',
            details: `Linked to "${generatedTitle}" (new product${duplicateOf ? `, copied from "${duplicateOf.title}"` : ''})`,
            userId: currentUser?.id, userName: currentUser?.name, at: new Date().toISOString(),
          };
          const { error: otherLogError } = await db.insertProductActivity(otherEntry);
          otherUpdates[oid] = { ...other, relatedProductIds: theirs, activity: otherLogError ? other.activity : [otherEntry, ...other.activity] };
        }
        if (!duplicateOf) {
          const ownEntry: ProductActivity = {
            id: generateId(), productId, type: 'LINK_ADDED',
            details: `Linked to ${copyLinks.map(l => `"${titleOf(l)}"`).join(', ')}`,
            userId: currentUser?.id, userName: currentUser?.name, at: new Date().toISOString(),
          };
          const { error: ownLogError } = await db.insertProductActivity(ownEntry);
          if (!ownLogError) newProduct.activity = [ownEntry];
        }
      }
    }

    // A copy records where it came from, what was copied over and what's different
    if (duplicateOf) {
      const main = suppliers.find(s => s.isMain);
      const entry: ProductActivity = {
        id: generateId(),
        productId,
        type: 'COPIED_FROM',
        details: `Copied from "${duplicateOf.title}". Copied over: brand, category, item name, description, size, unit, item capacity, packing, ` +
          `suppliers (${suppliers.map(s => nameOf(s.vendorId)).join(', ')}${main ? `; main: ${nameOf(main.vendorId)}` : ''}), ` +
          `linked products (${copyLinks.length > 0 ? copyLinks.map(titleOf).join(', ') : 'none'})` +
          `${perOrderMode ? ', "price set on each order" setting. No prices (price is typed on each order).' : '. Price history was not copied; prices were entered for the copy.'}` +
          ` What's different: ${whatsDifferent.trim()}`,
        userId: currentUser?.id,
        userName: currentUser?.name,
        at: new Date().toISOString(),
      };
      const { error: logError } = await db.insertProductActivity(entry);
      if (!logError) newProduct.activity = [entry];
    }
    setSaving(false);
    setProducts(prev => [newProduct, ...prev.map(p => otherUpdates[p.id] || p)]);
    if (linkProblem) {
      // Saved, but the links need adding again from the product page
      setShowAddModal(false);
      resetForm();
      setPageNotice(linkProblem);
      return;
    }
    setShowAddModal(false);
    const wasCopy = !!duplicateOf;
    resetForm();
    if (wasCopy) navigate(`/products/${productId}`);
  };

  // Latest delivery of this product (for vendors: their own deliveries only)
  const getLastDeliveryInfo = (productId: string) => {
    const lines = deliveries
      .flatMap(d => d.items.filter(i => i.productId === productId).map(item => ({ d, vendorId: deliveryLine(item, ctx.orders, products).vendorId })))
      .filter(l => !isSupplierRole || l.vendorId === mySupplierId)
      .sort((a, b) => new Date(b.d.deliveryDate).getTime() - new Date(a.d.deliveryDate).getTime());

    if (lines.length === 0) return null;
    const last = lines[0];
    return {
      date: last.d.deliveryDate,
      vendorName: vendors.find(s => s.id === last.vendorId)?.name || 'Unknown Vendor',
      challan: last.d.challanNumber
    };
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Products</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} of {products.length} products</p>
        </div>
        {can.createProducts && (
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            Create Product
          </button>
        )}
      </div>

      {pageNotice && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm font-bold flex justify-between gap-3">
          <span>{pageNotice}</span>
          <button onClick={() => setPageNotice('')} className="text-red-400 hover:text-red-700 shrink-0">✕</button>
        </div>
      )}

      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Icons.Search />
              </span>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[140px]"
            >
              <option value="">All Categories</option>
              {sortCategories(categories).map(cat => (
                <option key={cat.id} value={cat.name}>{categoryLabel(cat)}</option>
              ))}
            </select>
            {!isSupplierRole && <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[140px]"
            >
              <option value="">All Vendors</option>
              {vendors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>}
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[140px]"
            >
              <option value="">All Brands</option>
              {parentBrands(brands).map(parent => (
                <React.Fragment key={parent.id}>
                  <option value={`p:${parent.id}`}>{parent.name}</option>
                  {childBrandsOf(parent.id, brands).map(c => <option key={c.id} value={`c:${c.id}`}>{'   '}{c.name}</option>)}
                </React.Fragment>
              ))}
            </select>
            <select
              value={filterArchive}
              onChange={(e) => setFilterArchive(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[140px]"
            >
              <option value="">All Products</option>
              <option value="active">Active Only</option>
              <option value="archived">Archived Only</option>
            </select>
            {(filterCategory || filterVendor || filterArchive || filterBrand || searchTerm) && (
              <button
                onClick={() => { setFilterCategory(''); setFilterVendor(''); setFilterArchive(''); setFilterBrand(''); setSearchTerm(''); }}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50/30 border-b border-slate-100">
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Product Name</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Size</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">{isSupplierRole ? 'Your Price' : 'Main Supplier'}</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">{isSupplierRole ? '' : 'Other Suppliers'}</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest hidden sm:table-cell">Last Movement</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const shown = visibleSuppliers(p);
                const first = isSupplierRole ? shown[0] : mainSupplier(p);
                const others = isSupplierRole ? [] : shown.filter(s => s !== first && s.isActive);
                const vendorName = (vendorId: string) => vendors.find(v => v.id === vendorId)?.name || 'Unknown';
                const lastDelivery = getLastDeliveryInfo(p.id);
                const isExpanded = expandedProductId === p.id;

                return (
                  <React.Fragment key={p.id}>
                    <tr className={`group transition-all ${isExpanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50/80'} ${p.isArchived ? 'opacity-50 grayscale' : ''}`}>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <Link to={`/products/${p.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="font-black text-slate-900 leading-tight text-sm md:text-base max-w-[200px] md:max-w-md group-hover:text-indigo-600 truncate md:whitespace-normal">{p.itemName || p.title}{contentsPart(p.itemCapacity, p.itemCapacityUnit, p.packing) ? ` - ${contentsPart(p.itemCapacity, p.itemCapacityUnit, p.packing)}` : ''}</div>
                        </Link>
                        <div className="flex items-center gap-1 md:gap-2 mt-1 md:mt-2 flex-wrap">
                           {(() => {
                             const parts = productBrandParts(p, brands, brandSets);
                             return <>
                               <span className="text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded bg-slate-900 text-white uppercase">{entryText(parts.parentName, parts.childNames)}</span>
                               {parts.label && <span className="text-[8px] md:text-[9px] font-bold px-1.5 md:px-2 py-0.5 rounded bg-slate-100 text-slate-600">{parts.label}</span>}
                             </>;
                           })()}
                           <span className="text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">{p.category}</span>
                           {p.isArchived && <span className="text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded bg-slate-300 text-slate-700 uppercase">Archived</span>}
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="text-sm font-bold text-slate-700">{p.unitSize || '--'}</div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        {first ? (
                          <>
                            <div className="text-sm md:text-lg font-black text-indigo-600">{p.priceMode === 'PER_ORDER' ? 'On each order' : `PKR ${priceOn(first).toFixed(2)}`}</div>
                            <div className="text-[9px] md:text-[10px] font-bold text-slate-400 truncate max-w-[80px] md:max-w-[120px]" title={vendorName(first.vendorId)}>
                              {vendorName(first.vendorId)}{!first.isActive ? ' (stopped)' : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No main supplier</span>
                        )}
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        {others.length > 0 ? others.map(o => (
                          <div key={o.id} className="text-[10px] md:text-xs font-bold text-slate-500 truncate max-w-[120px] md:max-w-[180px]" title={vendorName(o.vendorId)}>
                            {vendorName(o.vendorId)}: <span className="font-black text-slate-700">{p.priceMode === 'PER_ORDER' ? 'on each order' : `PKR ${priceOn(o).toFixed(2)}`}</span>
                          </div>
                        )) : (
                          <span className="text-sm text-slate-300">--</span>
                        )}
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6 hidden sm:table-cell">
                        {lastDelivery ? (
                          <>
                            <div className="text-xs md:text-sm font-bold text-slate-700">{lastDelivery.date}</div>
                            <div className="text-[9px] md:text-[10px] text-emerald-500 font-bold uppercase">{lastDelivery.vendorName}</div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No history</span>
                        )}
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right">
                        <div className="flex justify-end gap-1 md:gap-2">
                          <button
                            onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                            className={`p-2 md:p-3 rounded-xl md:rounded-2xl transition-all ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-indigo-600'}`}
                            title="Quick View History"
                          >
                            <Icons.Search />
                          </button>
                          <button
                            onClick={() => navigate(`/products/${p.id}`)}
                            className="p-2 md:p-3 bg-slate-900 text-white rounded-xl md:rounded-2xl hover:bg-indigo-600 transition-all shadow-md"
                            title="Full Details"
                          >
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth={2}/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Quick Expand History Section */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-8 py-8 bg-indigo-50/10 border-b border-indigo-100">
                           <div className="flex justify-between items-center mb-6">
                              <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Recent Activity Pulse</h4>
                              <Link to={`/products/${p.id}`} className="text-[10px] font-black text-indigo-600 hover:underline uppercase">View Full Audit Log & Deliveries →</Link>
                           </div>
                           <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-top-2">
                              <div className="space-y-4">
                                 <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Icons.Category /> VENDOR PRICE REVISION
                                 </h4>
                                 <div className="grid grid-cols-2 gap-4">
                                    {shown.map(sup => (
                                        <div key={sup.id} className="bg-white p-5 rounded-3xl border border-indigo-100 shadow-sm">
                                           <div className="text-xs font-black text-slate-900 mb-4 border-b border-slate-50 pb-2 truncate">
                                              {vendorName(sup.vendorId)}{sup.isMain ? ' (Main)' : ''}{!sup.isActive ? ' (Stopped)' : ''}
                                           </div>
                                           <div className="space-y-2">
                                              {sortPrices(sup.prices).slice(0, 3).map(h => (
                                                <div key={h.id} className="flex justify-between items-center">
                                                   <span className="text-[10px] font-bold text-slate-500">From {h.effectiveDate}</span>
                                                   <span className="text-xs font-black text-indigo-600">PKR {h.price.toFixed(2)}</span>
                                                </div>
                                              ))}
                                           </div>
                                        </div>
                                    ))}
                                 </div>
                              </div>
                              
                              <div className="space-y-4">
                                 <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Icons.Delivery /> QUICK SPECS
                                 </h4>
                                 <div className="bg-white rounded-3xl border border-indigo-100 p-6 space-y-4">
                                    <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                       <span className="text-xs font-bold text-slate-500">Unit Size:</span>
                                       <span className="text-sm font-black text-slate-900">{p.unitSize}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                       <span className="text-xs font-bold text-slate-500">Linked Product:</span>
                                       <span className="text-sm font-black text-indigo-600">
                                          {p.relatedProductIds && p.relatedProductIds.length > 0 ? p.relatedProductIds.map(rid => products.find(prod => prod.id === rid)?.itemName).filter(Boolean).join(', ') : 'None'}
                                       </span>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 max-h-[95vh] flex flex-col">
            <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg md:text-2xl font-black text-slate-900">{duplicateOf ? 'Duplicate Product' : 'Add Product'}</h2>
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{duplicateOf ? `Copy of ${duplicateOf.title}` : 'Inventory & vendor mapping'}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="p-4 md:p-10 overflow-y-auto space-y-6 md:space-y-10 flex-1">
              
              <div className="space-y-4 md:space-y-6">
                <div className="bg-indigo-600 p-4 md:p-8 rounded-2xl md:rounded-[32px] text-white shadow-xl shadow-indigo-100">
                   <div className="text-[9px] md:text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2 md:mb-3">Display Name Preview</div>
                   <div className="text-sm md:text-xl font-black leading-tight">
                      {generatedTitle || 'Awaiting Input...'}
                   </div>
                </div>

                {duplicateOf && (
                  <div className="space-y-3">
                    <div className="p-3 md:p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs md:text-sm font-medium">
                      Everything is copied from the original except its price history. The prices below are the original's prices today: change any that are different. Change at least one thing before saving.
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">What's different from the original?*</label>
                      <textarea value={whatsDifferent} onChange={e => setWhatsDifferent(e.target.value)} rows={2} {...fe.field('whatsDifferent', "w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="e.g. Same carton in 50x30x30" />
                      <FieldMessage msg={fe.errors.whatsDifferent} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Brand*</label>
                    <select name="brand" value={formData.brand} onChange={handleInputChange} {...fe.field('brand', "w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")}>
                      <option value="">-- Choose brand or brand set --</option>
                      {brandEntries(brands, brandSets).filter(e => e.usable || e.key === formData.brand).map(e => (
                        <option key={e.key} value={e.key} disabled={!e.usable}>{e.setId ? `   ${e.text}` : e.text}{e.usable ? '' : ' (disabled)'}</option>
                      ))}
                    </select>
                    <FieldMessage msg={fe.errors.brand} />
                    <p className="text-[11px] text-slate-400 mt-1">Brands and brand sets are set up in the Brands section.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Category*</label>
                    <select name="category" value={formData.category} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required>
                      {sortCategories(categories).map(cat => (
                        <option key={cat.id} value={cat.name}>{categoryLabel(cat)}</option>
                      ))}
                    </select>
                    {categories.find(c => c.name === formData.category)?.shortCode && (
                      <p className="text-[11px] text-slate-400 mt-1">Short code: <span className="font-black text-slate-600">{categories.find(c => c.name === formData.category)?.shortCode}</span> (set in Categories)</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Name*</label>
                    <input name="itemName" value={formData.itemName} onChange={handleInputChange} type="text" {...fe.field('itemName', "w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="e.g. 5-Ply Corrugated Outer" />
                    <FieldMessage msg={fe.errors.itemName} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                    <input name="description" value={formData.description} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. Heavy duty corrugated box for shipping" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Size (L × W × H)</label>
                    <div className="flex gap-2">
                      <input name="unitSize" value={formData.unitSize} onChange={handleInputChange} type="text" {...fe.field('unitSize', "flex-1 min-w-0 px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="Optional, e.g. 11 x 11.5 x 13" />
                      <select name="measuringUnit" value={formData.measuringUnit} onChange={handleInputChange} className="w-24 px-3 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                        <option value="">Unit</option>
                        {measuringUnits.map(u => (
                          <option key={u.id} value={u.symbol}>{u.symbol}</option>
                        ))}
                      </select>
                    </div>
                    <FieldMessage msg={fe.errors.unitSize} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item capacity</label>
                    <div className="flex gap-2">
                      <input name="itemCapacity" value={formData.itemCapacity} onChange={handleInputChange} type="number" step="any" min="0" {...fe.field('itemCapacity', "flex-1 min-w-0 px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")} placeholder="Optional, e.g. 30" />
                      <select name="itemCapacityUnit" value={formData.itemCapacityUnit} onChange={handleInputChange} {...fe.field('itemCapacityUnit', "w-24 px-3 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm")}>
                        <option value="">Unit</option>
                        {measuringUnits.map(u => (
                          <option key={u.id} value={u.symbol}>{u.symbol}</option>
                        ))}
                      </select>
                    </div>
                    <FieldMessage msg={fe.errors.itemCapacity || fe.errors.itemCapacityUnit} />
                    <p className="text-[11px] text-slate-400 mt-1">The capacity of each item that goes into the carton. Units come from the Units section.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Packing</label>
                    <input name="packing" value={formData.packing} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="Optional, e.g. 26 Pcs or 24 Bottles" />
                    <p className="text-[11px] text-slate-400 mt-1">How many items go into one carton.</p>
                  </div>
                  {/* Linked products (two-way): several can be added. A copy starts with the original and its links. */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Linked Products (e.g. Inner for this Master)</label>
                    <p className="text-xs text-slate-500 mb-2">{duplicateOf
                      ? "The copy is linked to the original and to the original's linked products. Remove any you don't need."
                      : 'Linked products show on each other\'s page.'}</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {copyLinks.length === 0 && <span className="text-xs text-slate-400 italic">No linked products</span>}
                      {copyLinks.map(lid => (
                        <span key={lid} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold">
                          {products.find(p => p.id === lid)?.title || 'Unknown product'}{lid === duplicateOf?.id ? ' (original)' : ''}
                          <button type="button" onClick={() => setCopyLinks(prev => prev.filter(x => x !== lid))} className="text-indigo-400 hover:text-red-600" aria-label="Remove link">✕</button>
                        </span>
                      ))}
                    </div>
                    <LinkPicker
                      verb="Add"
                      candidates={products.filter(prod => !prod.isArchived && !copyLinks.includes(prod.id))}
                      categories={categories}
                      onConfirm={ids => { setCopyLinks(prev => [...prev, ...ids.filter(id => !prev.includes(id))]); return ''; }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:space-y-6 pt-4 md:pt-6 border-t border-slate-100">
                <div>
                  <h3 className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-widest">Suppliers and Prices*</h3>
                  <p className="text-xs text-slate-500 mt-1">{perOrderMode
                    ? 'Add at least one supplier. No price is asked: the supplier\'s price is typed on each order line.'
                    : 'Add at least one supplier. Each price is per piece and applies from its start date. Add older prices too if you have them.'}</p>
                </div>

                <label className="flex items-start gap-3 p-3 md:p-4 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={perOrderMode} onChange={e => { setPerOrderMode(e.target.checked); setPriceWarning(''); }} />
                  <span>Price set on each order<span className="block text-xs font-medium text-slate-500 mt-0.5">For products with no fixed price, e.g. custom stickers. The price is typed on the order line each time.</span></span>
                </label>

                {supplierDrafts.map((d, idx) => (
                  <div key={idx} className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[32px] space-y-3 border-2 border-transparent focus-within:border-indigo-200 transition-all">
                    <div className="flex items-center gap-2">
                      <select
                        value={d.vendorId}
                        onChange={e => { const v = e.target.value; if (mainVendorId === d.vendorId) setMainVendorId(''); updateSupplierDraft(idx, x => ({ ...x, vendorId: v })); }}
                        {...fe.field(`supplier-${idx}`, "w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white flex-1")}
                      >
                        <option value="">-- Choose Supplier --</option>
                        {vendors
                          .filter(v => v.id === d.vendorId || !supplierDrafts.some(o => o.vendorId === v.id))
                          .map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      {supplierDrafts.length > 1 && (
                        <button type="button" onClick={() => { if (mainVendorId === d.vendorId) setMainVendorId(''); setSupplierDrafts(prev => prev.filter((_, i) => i !== idx)); }} className="px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-red-600">Remove</button>
                      )}
                    </div>
                    <FieldMessage msg={fe.errors[`supplier-${idx}`]} />
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input type="radio" name="mainSupplier" disabled={!d.vendorId} checked={!!d.vendorId && mainVendorId === d.vendorId} onChange={() => setMainVendorId(d.vendorId)} />
                      Main supplier
                    </label>
                    {!perOrderMode && <>
                    <div className="space-y-2">
                      {d.prices.map((r, pIdx) => (
                        <div key={pIdx} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Price per piece (PKR)*</label>
                            <input type="number" step="0.001" min="0" value={r.price} placeholder="0.00" {...fe.field(`price-${idx}-${pIdx}`, "w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white")}
                              onChange={e => updateSupplierDraft(idx, x => ({ ...x, prices: x.prices.map((pr, i) => i === pIdx ? { ...pr, price: e.target.value } : pr) }))} />
                            <FieldMessage msg={fe.errors[`price-${idx}-${pIdx}`]} />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Starts on*</label>
                            <input type="date" value={r.effectiveDate} {...fe.field(`date-${idx}-${pIdx}`, "w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white")}
                              onChange={e => updateSupplierDraft(idx, x => ({ ...x, prices: x.prices.map((pr, i) => i === pIdx ? { ...pr, effectiveDate: e.target.value } : pr) }))} />
                            <FieldMessage msg={fe.errors[`date-${idx}-${pIdx}`]} />
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Note</label>
                            <input type="text" value={r.note} placeholder="Optional" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white"
                              onChange={e => updateSupplierDraft(idx, x => ({ ...x, prices: x.prices.map((pr, i) => i === pIdx ? { ...pr, note: e.target.value } : pr) }))} />
                          </div>
                          {d.prices.length > 1 ? (
                            <button type="button" onClick={() => updateSupplierDraft(idx, x => ({ ...x, prices: x.prices.filter((_, i) => i !== pIdx) }))} className="px-2 py-2.5 text-xs font-bold text-slate-400 hover:text-red-600">Remove</button>
                          ) : <span />}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => updateSupplierDraft(idx, x => ({ ...x, prices: [...x.prices, emptyPriceRow()] }))} className="text-xs font-black text-indigo-600 hover:underline">+ Add price</button>
                    </>}
                  </div>
                ))}

                {supplierDrafts.length < vendors.length && (
                  <button type="button" onClick={() => setSupplierDrafts(prev => [...prev, emptySupplierDraft()])} className="text-xs font-black text-indigo-600 hover:underline">+ Add another supplier</button>
                )}
                {mainVendorId === ''
                  ? <p className="text-[11px] text-slate-400">No main supplier chosen. That is allowed.</p>
                  : <button type="button" onClick={() => setMainVendorId('')} className="block text-[11px] font-bold text-slate-400 hover:underline">Clear main supplier</button>}
              </div>

              {priceWarning && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold">{priceWarning}</div>}
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold" role="alert">{formError}</div>}

              <div className="flex flex-col sm:flex-row justify-end gap-3 md:gap-4 pt-6 md:pt-10 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px] order-2 sm:order-1">Discard</button>
                <button type="submit" disabled={saving} className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] order-1 sm:order-2 disabled:opacity-50">{saving ? 'Saving...' : (duplicateOf ? 'Save Copy' : 'Save Product')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
