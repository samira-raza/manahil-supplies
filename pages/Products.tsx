
import React, { useContext, useState, useEffect, useMemo } from 'react';
import { CRMContext, generateId } from '../App';
import { Product, UserRole, PriceRecord } from '../types';
import { Icons } from '../constants';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../services/db';

const Products: React.FC = () => {
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Filter states
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  if (!ctx) return null;
  const { products, setProducts, vendors, currentUser, categories, measuringUnits, deliveries, orders } = ctx;

  // Form State
  const [formData, setFormData] = useState({
    brand: '',
    category: '',
    itemName: '',
    description: '',
    unitSize: '',
    measuringUnit: '',
    packing: '',
    primaryVendorId: '',
    primaryPrice: '',
    secondaryVendorId: '',
    secondaryPrice: '',
    relatedProductId: '',
  });

  // Auto-generate display name
  const generatedTitle = useMemo(() => {
    const parts = [
      formData.category,
      formData.brand,
      formData.itemName,
      formData.packing
    ].filter(Boolean);
    return parts.join(' ');
  }, [formData]);

  useEffect(() => {
    if (showAddModal && categories.length > 0 && !formData.category) {
      setFormData(prev => ({ ...prev, category: categories[0].name }));
    }
  }, [showAddModal, categories]);

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const canEditProducts = isSuperAdmin || isAdmin; // Only super admin and admin can add/edit products
  const mySupplierId = currentUser?.vendorId;

  // Filter products based on role
  const baseProducts = (isVendor || isVendorStaff)
    ? products.filter(p => p.primaryVendorId === mySupplierId || p.secondaryVendorId === mySupplierId)
    : products;

  const filtered = baseProducts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || p.category === filterCategory;
    const matchesVendor = !filterVendor || p.primaryVendorId === filterVendor || p.secondaryVendorId === filterVendor;
    return matchesSearch && matchesCategory && matchesVendor;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      // If primary vendor is changed to match current secondary, clear secondary
      if (name === 'primaryVendorId' && value && value === prev.secondaryVendorId) {
        return { ...prev, [name]: value, secondaryVendorId: '', secondaryPrice: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemName || !formData.brand || !formData.primaryVendorId || !formData.primaryPrice) {
      alert('Missing required fields: Brand, Item Name, Price, and Primary Vendor must be provided.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newPriceHistory: Record<string, PriceRecord[]> = {};

    if (formData.primaryVendorId) {
      newPriceHistory[formData.primaryVendorId] = [{ price: parseFloat(formData.primaryPrice), date: today }];
    }
    if (formData.secondaryVendorId && formData.secondaryPrice) {
      newPriceHistory[formData.secondaryVendorId] = [{ price: parseFloat(formData.secondaryPrice), date: today }];
    }

    const newProduct: Product = {
      id: generateId(),
      title: generatedTitle,
      brand: formData.brand,
      category: formData.category,
      itemName: formData.itemName,
      description: formData.description,
      unitSize: formData.unitSize,
      measuringUnit: formData.measuringUnit,
      packing: formData.packing,
      primaryVendorId: formData.primaryVendorId,
      primaryPrice: parseFloat(formData.primaryPrice),
      secondaryVendorId: formData.secondaryVendorId || '',
      secondaryPrice: formData.secondaryPrice ? parseFloat(formData.secondaryPrice) : 0,
      priceHistory: newPriceHistory,
      dateAdded: today,
      relatedProductIds: formData.relatedProductId ? [formData.relatedProductId] : [],
    };

    await db.upsertProduct(newProduct);
    setProducts(prev => [newProduct, ...prev]);
    setShowAddModal(false);
    setFormData({
      brand: '',
      category: categories[0]?.name || '',
      itemName: '',
      description: '',
      unitSize: '',
      measuringUnit: '',
      packing: '',
      primaryVendorId: '',
      primaryPrice: '',
      secondaryVendorId: '',
      secondaryPrice: '',
      relatedProductId: '',
    });
  };

  const getLastDeliveryInfo = (productId: string) => {
    const relevantDeliveries = deliveries
      .filter(d => d.items.some(item => item.productId === productId))
      .sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());

    if (relevantDeliveries.length === 0) return null;
    
    const lastDel = relevantDeliveries[0];
    const prod = products.find(p => p.id === productId);
    const vendor = vendors.find(s => s.id === prod?.primaryVendorId);

    return {
      date: lastDel.deliveryDate,
      vendorName: vendor?.name || 'Unknown Vendor',
      challan: lastDel.challanNumber
    };
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Products</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} of {products.length} products</p>
        </div>
        {canEditProducts && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            Create Product
          </button>
        )}
      </div>

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
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[140px]"
            >
              <option value="">All Vendors</option>
              {vendors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {(filterCategory || filterVendor || searchTerm) && (
              <button
                onClick={() => { setFilterCategory(''); setFilterVendor(''); setSearchTerm(''); }}
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
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Primary</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Secondary</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest hidden sm:table-cell">Last Movement</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const pVendor = vendors.find(s => s.id === p.primaryVendorId);
                const sVendor = vendors.find(s => s.id === p.secondaryVendorId);
                const lastDelivery = getLastDeliveryInfo(p.id);
                const isExpanded = expandedProductId === p.id;

                return (
                  <React.Fragment key={p.id}>
                    <tr className={`group transition-all ${isExpanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <Link to={`/products/${p.id}`} className="block hover:text-indigo-600 transition-colors">
                          <div className="font-black text-slate-900 leading-tight text-sm md:text-base max-w-[200px] md:max-w-md group-hover:text-indigo-600 truncate md:whitespace-normal">{p.itemName || p.title}{p.packing ? ` - ${p.packing}` : ''}</div>
                        </Link>
                        <div className="flex items-center gap-1 md:gap-2 mt-1 md:mt-2 flex-wrap">
                           <span className="text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded bg-slate-900 text-white uppercase">{p.brand}</span>
                           <span className="text-[8px] md:text-[9px] font-black px-1.5 md:px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">{p.category}</span>
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="text-sm font-bold text-slate-700">{p.unitSize || '--'}</div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="text-sm md:text-lg font-black text-indigo-600">PKR {p.primaryPrice.toFixed(2)}</div>
                        <div className="text-[9px] md:text-[10px] font-bold text-slate-400 truncate max-w-[80px] md:max-w-[120px]" title={pVendor?.name}>
                          {pVendor?.name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="text-sm md:text-lg font-black text-slate-400">
                          {p.secondaryPrice > 0 ? `PKR ${p.secondaryPrice.toFixed(2)}` : '--'}
                        </div>
                        <div className="text-[9px] md:text-[10px] font-bold text-slate-400 truncate max-w-[80px] md:max-w-[120px]" title={sVendor?.name}>
                          {sVendor?.name || 'N/A'}
                        </div>
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
                                    {[p.primaryVendorId, p.secondaryVendorId].filter(Boolean).map(vId => {
                                      const vendor = vendors.find(s => s.id === vId);
                                      const history = p.priceHistory[vId!] || [];
                                      return (
                                        <div key={vId} className="bg-white p-5 rounded-3xl border border-indigo-100 shadow-sm">
                                           <div className="text-xs font-black text-slate-900 mb-4 border-b border-slate-50 pb-2 truncate">{vendor?.name}</div>
                                           <div className="space-y-2">
                                              {history.slice(-3).reverse().map((h, idx) => (
                                                <div key={idx} className="flex justify-between items-center">
                                                   <span className="text-[10px] font-bold text-slate-500">{h.date}</span>
                                                   <span className="text-xs font-black text-indigo-600">PKR {h.price.toFixed(2)}</span>
                                                </div>
                                              ))}
                                           </div>
                                        </div>
                                      );
                                    })}
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
                <h2 className="text-lg md:text-2xl font-black text-slate-900">Add Product</h2>
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Inventory & vendor mapping</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 md:p-10 overflow-y-auto space-y-6 md:space-y-10 flex-1">
              
              <div className="space-y-4 md:space-y-6">
                <div className="bg-indigo-600 p-4 md:p-8 rounded-2xl md:rounded-[32px] text-white shadow-xl shadow-indigo-100">
                   <div className="text-[9px] md:text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2 md:mb-3">Display Name Preview</div>
                   <div className="text-sm md:text-xl font-black leading-tight">
                      {generatedTitle || 'Awaiting Input...'}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Brand Name*</label>
                    <input name="brand" value={formData.brand} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. LogiPack" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Category*</label>
                    <select name="category" value={formData.category} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Name*</label>
                    <input name="itemName" value={formData.itemName} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. 5-Ply Corrugated Outer" required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                    <input name="description" value={formData.description} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. Heavy duty corrugated box for shipping" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unit Size*</label>
                    <div className="flex gap-2">
                      <input name="unitSize" value={formData.unitSize} onChange={handleInputChange} type="text" className="flex-1 px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. 60x40x40" required />
                      <select name="measuringUnit" value={formData.measuringUnit} onChange={handleInputChange} className="w-24 px-3 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                        <option value="">Unit</option>
                        {measuringUnits.map(u => (
                          <option key={u.id} value={u.symbol}>{u.symbol}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Packing*</label>
                    <input name="packing" value={formData.packing} onChange={handleInputChange} type="text" className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. Bundle of 50" required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Link Related Product (e.g. Inner for this Master)</label>
                    <select name="relatedProductId" value={formData.relatedProductId} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                       <option value="">No link</option>
                       {products.map(prod => (
                         <option key={prod.id} value={prod.id}>{prod.title}</option>
                       ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:space-y-6 pt-4 md:pt-6 border-t border-slate-100">
                <h3 className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-widest">Vendor Mapping</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-10">
                   <div className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 border-2 border-transparent focus-within:border-indigo-200 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                         <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] md:text-[10px] font-black">P</div>
                         <span className="text-[10px] md:text-xs font-black text-slate-900 uppercase tracking-wider md:tracking-widest">Primary Vendor</span>
                      </div>
                      <div>
                        <select name="primaryVendorId" value={formData.primaryVendorId} onChange={handleInputChange} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white" required>
                          <option value="">-- Choose Vendor --</option>
                          {vendors.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Unit Price (PKR)*</label>
                        <input name="primaryPrice" value={formData.primaryPrice} onChange={handleInputChange} type="number" step="0.001" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white" placeholder="0.00" required />
                      </div>
                   </div>

                   <div className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 border-2 border-transparent focus-within:border-slate-200 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                         <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-400 text-white flex items-center justify-center text-[9px] md:text-[10px] font-black">S</div>
                         <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Secondary Vendor</span>
                      </div>
                      <div>
                        <select name="secondaryVendorId" value={formData.secondaryVendorId} onChange={handleInputChange} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white">
                          <option value="">None</option>
                          {vendors
                            .filter(s => s.id !== formData.primaryVendorId)
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Unit Price (PKR)</label>
                        <input name="secondaryPrice" value={formData.secondaryPrice} onChange={handleInputChange} type="number" step="0.001" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold bg-white" placeholder="0.00" />
                      </div>
                   </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 md:gap-4 pt-6 md:pt-10 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px] order-2 sm:order-1">Discard</button>
                <button type="submit" className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px] order-1 sm:order-2">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
