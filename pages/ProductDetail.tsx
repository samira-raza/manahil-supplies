
import React, { useContext, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CRMContext } from '../App';
import { Icons } from '../constants';
import { PriceRecord } from '../types';

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();

  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  if (!ctx || !id) return null;
  const { products, setProducts, vendors, deliveries, orders, measuringUnits } = ctx;

  const product = products.find(p => p.id === id);
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-6 md:p-8">
        <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-4">Product Not Found</h2>
        <button onClick={() => navigate('/products')} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Back to Products</button>
      </div>
    );
  }

  const primaryVendor = vendors.find(s => s.id === product.primaryVendorId);
  const secondaryVendor = vendors.find(s => s.id === product.secondaryVendorId);
  const relatedProduct = products.find(p => p.id === product.relatedProductId);

  // Get last 10 deliveries
  const lastDeliveries = useMemo(() => {
    return deliveries
      .filter(d => d.items.some(item => item.productId === id))
      .sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime())
      .slice(0, 10);
  }, [deliveries, id]);

  return (
    <div className="space-y-4 md:space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start md:items-center gap-3 md:gap-4">
          <button onClick={() => navigate('/products')} className="p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2}/></svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-black text-slate-900 leading-tight tracking-tight break-words">{product.title}</h1>
            <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">Added: {product.dateAdded}</p>
          </div>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button onClick={() => setShowMetadataModal(true)} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm text-sm">Edit Info</button>
          <button onClick={() => setShowPricingModal(true)} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm">Update Price</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">

        {/* Left Column: Stats & Vendors */}
        <div className="space-y-4 md:space-y-8">
          {/* Linked Product Card */}
          <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 md:mb-6">Linked Product Family</h3>
            {relatedProduct ? (
              <div className="group relative bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-[24px] border border-slate-100 hover:border-indigo-300 transition-all">
                <div className="text-sm font-black text-slate-900 mb-1 break-words">{relatedProduct.title}</div>
                <div className="text-[10px] text-indigo-600 font-bold uppercase mb-3 md:mb-4">{relatedProduct.category}</div>
                <Link
                  to={`/products/${relatedProduct.id}`}
                  className="inline-flex items-center gap-2 text-xs font-black text-indigo-600 hover:underline"
                >
                  View Linked Profile <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" strokeWidth={2}/></svg>
                </Link>
              </div>
            ) : (
              <div className="py-4 md:py-6 px-4 bg-slate-50 rounded-2xl md:rounded-3xl border-2 border-dashed border-slate-200 text-center text-slate-400 text-xs italic">
                No related products linked (e.g. Inner Carton)
              </div>
            )}
          </div>

          {/* Current Pricing Card */}
          <div className="bg-indigo-600 p-5 md:p-8 rounded-2xl md:rounded-[40px] text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
             <div className="relative z-10">
                <h3 className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4 md:mb-8">Active Procurement Rate</h3>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl md:text-5xl font-black">PKR {product.primaryPrice.toFixed(2)}</span>
                  <span className="text-xs md:text-sm font-bold text-indigo-200 mb-0.5 md:mb-1">/ unit</span>
                </div>
                <div className="text-[10px] md:text-xs font-bold text-indigo-100 uppercase tracking-widest truncate">Primary: {primaryVendor?.name}</div>

                <div className="mt-5 md:mt-8 pt-4 md:pt-6 border-t border-indigo-500/50 flex justify-between items-center gap-4">
                   <div className="min-w-0">
                      <div className="text-[9px] md:text-[10px] text-indigo-200 font-black uppercase tracking-widest">Secondary Rate</div>
                      <div className="text-lg md:text-xl font-black">{product.secondaryPrice > 0 ? `PKR ${product.secondaryPrice.toFixed(2)}` : '--'}</div>
                   </div>
                   <div className="text-right shrink-0">
                      <div className="text-[9px] md:text-[10px] text-indigo-200 font-black uppercase tracking-widest">Savings</div>
                      <div className="text-lg md:text-xl font-black text-emerald-300">
                        {product.secondaryPrice > 0 && product.primaryPrice > product.secondaryPrice ? `${((product.primaryPrice - product.secondaryPrice) / product.primaryPrice * 100).toFixed(1)}%` : '--'}
                      </div>
                   </div>
                </div>
             </div>
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
          </div>
        </div>

        {/* Middle/Right: Detailed History and Deliveries */}
        <div className="lg:col-span-2 space-y-4 md:space-y-8">

          {/* Vendor Price Revision Audit Log */}
          <div className="bg-white rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-8 border-b border-slate-50 bg-slate-50/30">
               <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                 <Icons.Category /> Vendor Price Audit Log
               </h3>
               <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">Rate revisions from primary and secondary sources</p>
            </div>
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
               {[product.primaryVendorId, product.secondaryVendorId].filter(Boolean).map(vId => {
                  const vendor = vendors.find(s => s.id === vId);
                  const history = product.priceHistory[vId!] || [];
                  return (
                    <div key={vId} className="space-y-3 md:space-y-4">
                       <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                          <span className="truncate mr-2">{vendor?.name}</span>
                          <span className="text-indigo-600 shrink-0">{history.length} Points</span>
                       </div>
                       <div className="bg-slate-50 rounded-2xl md:rounded-3xl p-3 md:p-4 space-y-2 md:space-y-3">
                          {history.slice().reverse().map((h, idx) => (
                            <div key={idx} className="flex justify-between items-center group/row">
                               <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-indigo-600 animate-pulse' : 'bg-slate-300'}`}></div>
                                  <span className="text-[10px] md:text-xs font-bold text-slate-600">{h.date}</span>
                               </div>
                               <span className="text-xs md:text-sm font-black text-slate-900 group-hover/row:text-indigo-600 transition-colors">PKR {h.price.toFixed(2)}</span>
                            </div>
                          ))}
                          {history.length === 0 && <div className="text-xs text-slate-400 italic py-2">No revision data.</div>}
                       </div>
                    </div>
                  );
               })}
            </div>
          </div>

          {/* Delivery Movement Audit */}
          <div className="bg-white rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
               <div>
                 <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                   <Icons.Delivery /> Last 10 Shipments
                 </h3>
                 <p className="text-[10px] md:text-xs text-slate-500 font-medium mt-1">Physical inventory movement audit</p>
               </div>
               <button className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-widest self-start sm:self-auto shrink-0">Pull Extended History</button>
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

        </div>
      </div>

      {/* Edit Metadata Modal */}
      {showMetadataModal && (
        <MetadataModal
          product={product}
          categories={ctx.categories}
          measuringUnits={measuringUnits}
          products={products}
          onClose={() => setShowMetadataModal(false)}
          onSave={(updates) => {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
            setShowMetadataModal(false);
          }}
        />
      )}

      {/* Update Pricing Modal */}
      {showPricingModal && (
        <PricingModal
          product={product}
          vendors={vendors}
          onClose={() => setShowPricingModal(false)}
          onSave={(vendorId, newPrice) => {
            const today = new Date().toISOString().split('T')[0];
            setProducts(prev => prev.map(p => {
              if (p.id !== id) return p;
              const updatedHistory = { ...p.priceHistory };
              const vendorHistory = updatedHistory[vendorId] || [];
              updatedHistory[vendorId] = [...vendorHistory, { price: newPrice, date: today }];

              const isPrimary = vendorId === p.primaryVendorId;
              return {
                ...p,
                ...(isPrimary ? { primaryPrice: newPrice } : { secondaryPrice: newPrice }),
                priceHistory: updatedHistory
              };
            }));
            setShowPricingModal(false);
          }}
        />
      )}
    </div>
  );
};

// Metadata Edit Modal Component
const MetadataModal: React.FC<{
  product: any;
  categories: any[];
  measuringUnits: any[];
  products: any[];
  onClose: () => void;
  onSave: (updates: any) => void;
}> = ({ product, categories, measuringUnits, products, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    brand: product.brand,
    category: product.category,
    itemName: product.itemName,
    description: product.description || '',
    unitSize: product.unitSize,
    measuringUnit: product.measuringUnit || '',
    packing: product.packing,
    relatedProductId: product.relatedProductId || '',
  });

  const generatedTitle = useMemo(() => {
    return [formData.category, formData.brand, formData.itemName, formData.packing].filter(Boolean).join(' ');
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, title: generatedTitle });
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

        <form onSubmit={handleSubmit} className="p-4 md:p-10 overflow-y-auto space-y-4 md:space-y-6 flex-1">
          <div className="bg-indigo-600 p-4 md:p-6 rounded-2xl md:rounded-[24px] text-white shadow-lg">
            <div className="text-[9px] md:text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Display Name Preview</div>
            <div className="text-sm md:text-lg font-black leading-tight break-words">{generatedTitle || 'Awaiting Input...'}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Brand Name*</label>
              <input name="brand" value={formData.brand} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Category*</label>
              <select name="category" value={formData.category} onChange={handleChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Item Name*</label>
              <input name="itemName" value={formData.itemName} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
              <input name="description" value={formData.description} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unit Size*</label>
              <div className="flex gap-2">
                <input name="unitSize" value={formData.unitSize} onChange={handleChange} type="text" className="flex-1 px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" placeholder="e.g. 60x40x40" required />
                <select name="measuringUnit" value={formData.measuringUnit} onChange={handleChange} className="w-20 md:w-24 px-2 md:px-3 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                  <option value="">Unit</option>
                  {measuringUnits.map((u: any) => (
                    <option key={u.id} value={u.symbol}>{u.symbol}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Packing*</label>
              <input name="packing" value={formData.packing} onChange={handleChange} type="text" className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm" required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Linked Product</label>
              <select name="relatedProductId" value={formData.relatedProductId} onChange={handleChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm">
                <option value="">No link</option>
                {products.filter(p => p.id !== product.id).map(prod => (
                  <option key={prod.id} value={prod.id}>{prod.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 md:pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]">Cancel</button>
            <button type="submit" className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px]">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Pricing Update Modal Component
const PricingModal: React.FC<{
  product: any;
  vendors: any[];
  onClose: () => void;
  onSave: (vendorId: string, newPrice: number) => void;
}> = ({ product, vendors, onClose, onSave }) => {
  const [selectedVendor, setSelectedVendor] = useState(product.primaryVendorId);
  const [newPrice, setNewPrice] = useState('');

  const primaryVendor = vendors.find(s => s.id === product.primaryVendorId);
  const secondaryVendor = vendors.find(s => s.id === product.secondaryVendorId);

  const currentPrice = selectedVendor === product.primaryVendorId ? product.primaryPrice : product.secondaryPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrice || isNaN(parseFloat(newPrice))) {
      alert('Please enter a valid price');
      return;
    }
    onSave(selectedVendor, parseFloat(newPrice));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-lg md:text-2xl font-black text-slate-900">Update Pricing</h2>
            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Record new vendor rate</p>
          </div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
            <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-10 space-y-4 md:space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Vendor*</label>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm"
            >
              {primaryVendor && <option value={product.primaryVendorId}>{primaryVendor.name} (Primary)</option>}
              {secondaryVendor && <option value={product.secondaryVendorId}>{secondaryVendor.name} (Secondary)</option>}
            </select>
          </div>

          <div className="bg-slate-50 p-4 md:p-6 rounded-xl md:rounded-2xl">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Rate</div>
            <div className="text-2xl md:text-3xl font-black text-slate-900">PKR {currentPrice.toFixed(2)}</div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New Price (PKR)*</label>
            <input
              type="number"
              step="0.001"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm"
              placeholder="Enter new price"
              required
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 md:pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]">Cancel</button>
            <button type="submit" className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px]">Update Price</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductDetail;
