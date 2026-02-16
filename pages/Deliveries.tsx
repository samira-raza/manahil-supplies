
import React, { useContext, useState, useMemo } from 'react';
import { CRMContext, generateId } from '../App';
import { UserRole, Delivery, DeliveryStatus, ChallanStatus, Product } from '../types';
import { db } from '../services/db';
import { Icons } from '../constants';

const Deliveries: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrderNo, setSelectedOrderNo] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [deliveryItems, setDeliveryItems] = useState<{ productId: string, quantity: number }[]>([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrder, setFilterOrder] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  // State for viewing/printing challan
  const [activeChallan, setActiveChallan] = useState<Delivery | null>(null);

  // State for overall status change
  const [statusChangeTarget, setStatusChangeTarget] = useState<Delivery | null>(null);
  const [newChallanStatus, setNewChallanStatus] = useState<ChallanStatus>(ChallanStatus.ACTIVE);
  const [statusDescription, setStatusDescription] = useState('');

  // State for per-item status change
  const [itemStatusIdx, setItemStatusIdx] = useState<number | null>(null);
  const [itemStatusValue, setItemStatusValue] = useState<ChallanStatus>(ChallanStatus.RETURNED);
  const [itemStatusDesc, setItemStatusDesc] = useState('');

  if (!ctx) return null;
  const { deliveries, setDeliveries, orders, setOrders, products, currentUser, vendors, recalculateOrderStatuses } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const isSupplierRole = isVendor || isVendorStaff;
  const mySupplierId = currentUser?.vendorId;

  // Everyone can create deliveries (vendors for their own orders)

  const baseFilteredDeliveries = isSupplierRole
    ? deliveries.filter(d => {
        return d.items.some(di => {
           const p = products.find(prod => prod.id === di.productId);
           return p?.primaryVendorId === mySupplierId || p?.secondaryVendorId === mySupplierId;
        });
      })
    : deliveries;

  // Apply search, order, and vendor filters
  const filteredDeliveries = baseFilteredDeliveries.filter(d => {
    const matchesSearch = !searchTerm ||
      d.challanNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.deliveryDate.includes(searchTerm);
    const matchesOrder = !filterOrder || d.items.some(i => i.orderNumber === filterOrder);
    const matchesVendor = !filterVendor || d.items.some(i => {
      const prod = products.find(p => p.id === i.productId);
      return prod?.primaryVendorId === filterVendor;
    });
    return matchesSearch && matchesOrder && matchesVendor;
  });

  const activeOrders = useMemo(() => {
    return orders.filter(o => {
      if (isSupplierRole) {
        const isPart = o.items.some(i => {
          const p = products.find(prod => prod.id === i.productId);
          return p?.primaryVendorId === mySupplierId || p?.secondaryVendorId === mySupplierId;
        });
        if (!isPart) return false;
      }
      return true;
    });
  }, [orders, isSupplierRole, mySupplierId, products]);

  const handleOrderChange = (orderNo: string) => {
    setSelectedOrderNo(orderNo);
    const order = orders.find(o => o.orderNumber === orderNo);
    if (order) {
      setDeliveryItems(order.items.map(i => ({ productId: i.productId, quantity: 0 })));
    } else {
      setDeliveryItems([]);
    }
  };

  const handleItemQtyChange = (productId: string, qty: number) => {
    // Constraint: Quantity cannot be negative
    const safeQty = Math.max(0, qty);
    setDeliveryItems(prev => prev.map(item => 
      item.productId === productId ? { ...item, quantity: safeQty } : item
    ));
  };

  const handleSubmitDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderNo || !challanNumber || deliveryItems.every(i => i.quantity <= 0)) {
      alert("Validation Error: Please select an order, provide a challan number, and ensure at least one item has a positive quantity.");
      return;
    }

    const newDelivery: Delivery = {
      id: generateId(),
      challanNumber: challanNumber,
      deliveryDate: new Date().toISOString().split('T')[0],
      challanStatus: ChallanStatus.ACTIVE,
      items: deliveryItems
        .filter(i => i.quantity > 0)
        .map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          orderNumber: selectedOrderNo,
          newStatus: DeliveryStatus.PARTIAL 
        }))
    };

    setDeliveries(prev => [newDelivery, ...prev]);
    setShowAddModal(false);
    resetForm();
    alert(`Success: Delivery recorded under Challan ${challanNumber}.`);
  };

  const resetForm = () => {
    setSelectedOrderNo('');
    setChallanNumber('');
    setDeliveryItems([]);
  };

  const handlePrint = () => {
    window.print();
  };

  const getChallanStatusColor = (status: ChallanStatus) => {
    switch (status) {
      case ChallanStatus.ACTIVE: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case ChallanStatus.CANCELLED: return 'bg-red-100 text-red-700 border-red-200';
      case ChallanStatus.RETURNED: return 'bg-amber-100 text-amber-700 border-amber-200';
      case ChallanStatus.PARTIAL_RETURNED: return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const deriveChallanStatus = (items: typeof activeChallan extends null ? never : NonNullable<typeof activeChallan>['items']) => {
    const statuses = items.map(i => i.itemStatus || ChallanStatus.ACTIVE);
    if (statuses.every(s => s === ChallanStatus.ACTIVE)) return ChallanStatus.ACTIVE;
    if (statuses.every(s => s === ChallanStatus.RETURNED)) return ChallanStatus.RETURNED;
    if (statuses.every(s => s === ChallanStatus.CANCELLED)) return ChallanStatus.CANCELLED;
    if (statuses.some(s => s === ChallanStatus.RETURNED)) return ChallanStatus.PARTIAL_RETURNED;
    return ChallanStatus.ACTIVE;
  };

  const handleStatusChange = async () => {
    if (!statusChangeTarget) return;
    if ((newChallanStatus === ChallanStatus.CANCELLED || newChallanStatus === ChallanStatus.RETURNED) && !statusDescription.trim()) {
      alert('Please provide a description for this status change.');
      return;
    }
    // When overall challan is marked Returned/Cancelled, apply to all items
    const updatedItems = statusChangeTarget.items.map(item => ({
      ...item,
      itemStatus: newChallanStatus,
      itemStatusDescription: statusDescription.trim()
    }));
    await db.updateDeliveryFull(statusChangeTarget.id, newChallanStatus, statusDescription.trim(), updatedItems);
    const updatedDelivery = { ...statusChangeTarget, challanStatus: newChallanStatus, statusDescription: statusDescription.trim(), items: updatedItems };
    const newDeliveries = deliveries.map(d => d.id === statusChangeTarget.id ? updatedDelivery : d);
    setDeliveries(newDeliveries);
    setActiveChallan(prev => prev?.id === statusChangeTarget.id ? updatedDelivery : prev);
    const updatedOrders = await recalculateOrderStatuses(orders, newDeliveries);
    setOrders(updatedOrders);
    setStatusChangeTarget(null);
    setNewChallanStatus(ChallanStatus.ACTIVE);
    setStatusDescription('');
  };

  const handleItemStatusChange = async (delivery: Delivery, itemIdx: number, newStatus: ChallanStatus, description: string) => {
    if (!description.trim()) {
      alert('Please provide a description for this status change.');
      return;
    }
    const updatedItems = delivery.items.map((item, idx) =>
      idx === itemIdx ? { ...item, itemStatus: newStatus, itemStatusDescription: description.trim() } : item
    );
    const overallStatus = deriveChallanStatus(updatedItems);
    const overallDesc = overallStatus !== delivery.challanStatus
      ? (overallStatus === ChallanStatus.PARTIAL_RETURNED ? 'Partial return' : delivery.statusDescription || '')
      : (delivery.statusDescription || '');
    await db.updateDeliveryFull(delivery.id, overallStatus, overallDesc, updatedItems);
    const updatedDelivery = { ...delivery, challanStatus: overallStatus, statusDescription: overallDesc, items: updatedItems };
    const newDeliveries = deliveries.map(d => d.id === delivery.id ? updatedDelivery : d);
    setDeliveries(newDeliveries);
    setActiveChallan(prev => prev?.id === delivery.id ? updatedDelivery : prev);
    const updatedOrders = await recalculateOrderStatuses(orders, newDeliveries);
    setOrders(updatedOrders);
  };

  const handleDeleteChallan = async (delivery: Delivery) => {
    if (!confirm(`Are you sure you want to delete challan ${delivery.challanNumber}? This action cannot be undone.`)) return;
    await db.deleteDelivery(delivery.id);
    const newDeliveries = deliveries.filter(d => d.id !== delivery.id);
    setDeliveries(newDeliveries);
    setActiveChallan(null);
    const updatedOrders = await recalculateOrderStatuses(orders, newDeliveries);
    setOrders(updatedOrders);
  };

  // Get unique order numbers from deliveries for filter dropdown
  const orderNumbers = [...new Set(deliveries.flatMap(d => d.items.map(i => i.orderNumber)))];

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Deliveries</h1>
          <p className="text-sm text-slate-500 mt-1">{filteredDeliveries.length} of {deliveries.length} challans</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 w-full md:w-auto"
        >
          <Icons.Plus />
          Record Shipment
        </button>
      </div>

      <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden no-print">
        {/* Filters */}
        <div className="p-3 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Icons.Search />
              </span>
              <input
                type="text"
                placeholder="Search challan or date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
              />
            </div>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[160px]"
            >
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <select
              value={filterOrder}
              onChange={(e) => setFilterOrder(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[160px]"
            >
              <option value="">All Orders</option>
              {orderNumbers.map(orderNo => (
                <option key={orderNo} value={orderNo}>{orderNo}</option>
              ))}
            </select>
            {(searchTerm || filterOrder || filterVendor) && (
              <button
                onClick={() => { setSearchTerm(''); setFilterOrder(''); setFilterVendor(''); }}
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
              <tr className="bg-slate-50/50">
                <th className="px-4 md:px-6 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Challan No.</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Orders</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest hidden sm:table-cell">Date</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest">Status</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider md:tracking-widest hidden sm:table-cell">Payload</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeliveries.map(d => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-4 md:px-6 py-4 md:py-5">
                    <div className="flex items-center gap-2">
                       <div className="p-1.5 md:p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Icons.Delivery /></div>
                       <span className="font-bold text-slate-900 text-sm">{d.challanNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 md:py-5">
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(d.items.map(i => i.orderNumber))].map(on => (
                        <span key={on} className="text-[9px] md:text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">{on}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 md:py-5 text-sm font-bold text-slate-600 hidden sm:table-cell">{d.deliveryDate}</td>
                  <td className="px-4 md:px-6 py-4 md:py-5">
                    <span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-lg uppercase border ${getChallanStatusColor(d.challanStatus || ChallanStatus.ACTIVE)}`}>
                      {d.challanStatus || ChallanStatus.ACTIVE}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 md:py-5 hidden sm:table-cell">
                    <div className="text-sm font-black text-slate-700">{d.items.length} SKU(s)</div>
                    <div className="text-[10px] text-slate-400 mt-1 font-bold uppercase">
                      {d.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} Units
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 md:py-5 text-right">
                    <button
                      onClick={() => setActiveChallan(d)}
                      className="text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-indigo-600 hover:text-indigo-800 flex items-center justify-end gap-1 px-2 md:px-4 py-2 hover:bg-indigo-50 rounded-xl transition-all"
                    >
                      View <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth={2} /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredDeliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No movements found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Challan Document View (PDF Alternative) */}
      {activeChallan && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-2 md:p-4 overflow-y-auto">
           <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-300 my-4 md:my-8 flex flex-col max-h-[95vh]">
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center no-print shrink-0">
                 <h2 className="text-base md:text-xl font-black text-slate-900">Delivery Challan</h2>
                 <div className="flex gap-2 md:gap-3">
                    {(isSuperAdmin || isAdmin) && (activeChallan.challanStatus === ChallanStatus.ACTIVE || activeChallan.challanStatus === ChallanStatus.PARTIAL_RETURNED) && (
                      <button onClick={() => { setStatusChangeTarget(activeChallan); setNewChallanStatus(ChallanStatus.ACTIVE); setStatusDescription(''); }} className="px-3 md:px-5 py-2 bg-amber-500 text-white rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all">Change Status</button>
                    )}
                    {isSuperAdmin && (
                      <button onClick={() => handleDeleteChallan(activeChallan)} className="px-3 md:px-5 py-2 bg-red-600 text-white rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all">Delete</button>
                    )}
                    <button onClick={handlePrint} className="px-3 md:px-5 py-2 bg-indigo-600 text-white rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-1 md:gap-2"><Icons.Check /> Print</button>
                    <button onClick={() => setActiveChallan(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><Icons.Logout /></button>
                 </div>
              </div>

              <div id="challan-printable" className="p-4 md:p-12 print:p-0 bg-white overflow-y-auto flex-1">
                 <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 md:mb-12">
                    <div>
                       <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg md:text-xl mb-3 md:mb-4">MS</div>
                       <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase">Delivery Challan</h3>
                       <p className="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest mt-1">Ref: {activeChallan.challanNumber}</p>
                    </div>
                    <div className="sm:text-right">
                       <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase mb-1">Issue Date</div>
                       <div className="text-sm font-black text-slate-900">{activeChallan.deliveryDate}</div>
                       <div className="mt-3 md:mt-4">
                          <div className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg inline-block border ${getChallanStatusColor(activeChallan.challanStatus || ChallanStatus.ACTIVE)}`}>{activeChallan.challanStatus || ChallanStatus.ACTIVE}</div>
                       </div>
                       {activeChallan.statusDescription && (
                         <div className="mt-2 text-[10px] text-slate-500 font-bold italic">{activeChallan.statusDescription}</div>
                       )}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-12 mb-6 md:mb-12 border-y border-slate-100 py-4 md:py-8">
                    <div>
                       <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-4">From (Consignor)</h4>
                       <div className="font-black text-slate-900 text-sm">Manahil Supplies</div>
                       <div className="text-[10px] md:text-xs text-slate-500 font-medium leading-relaxed mt-1">123 Industrial Hub, Sector 5<br/>Warehouse Wing B<br/>Contact: +91 98765 43210</div>
                    </div>
                    <div>
                       <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-4">Orders Included</h4>
                       <div className="flex flex-wrap gap-2">
                          {[...new Set(activeChallan.items.map(i => i.orderNumber))].map(on => (
                            <div key={on} className="text-xs font-black text-indigo-600">PO Ref: {on}</div>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="overflow-x-auto mb-6 md:mb-12">
                   <table className="w-full text-left min-w-[400px]">
                      <thead className="border-b-2 border-slate-900">
                         <tr>
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest">Item Description</th>
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest">Size</th>
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Order Ref</th>
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Quantity</th>
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">UOM</th>
                            {isSuperAdmin && <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Unit Price</th>}
                            {isSuperAdmin && <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Total</th>}
                            <th className="py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-900 uppercase tracking-widest">Status</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {activeChallan.items.map((item, idx) => {
                            const p = products.find(prod => prod.id === item.productId);
                            const unitPrice = p?.primaryPrice || 0;
                            const itemSt = item.itemStatus || ChallanStatus.ACTIVE;
                            const isItemActive = itemSt === ChallanStatus.ACTIVE;
                            const lineTotal = isItemActive ? item.quantity * unitPrice : 0;
                            return (
                              <React.Fragment key={idx}>
                              <tr className={!isItemActive ? 'opacity-60' : ''}>
                                 <td className="py-3 md:py-4">
                                    <div className="text-[10px] md:text-xs font-black text-slate-900">{p?.title}</div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase">{p?.category}</div>
                                 </td>
                                 <td className="py-3 md:py-4 text-[10px] md:text-xs font-bold text-slate-600">{p?.unitSize || '--'}</td>
                                 <td className="py-3 md:py-4 text-right text-[10px] md:text-xs font-bold text-slate-500">{item.orderNumber}</td>
                                 <td className="py-3 md:py-4 text-right text-xs md:text-sm font-black text-slate-900">{item.quantity.toLocaleString()}</td>
                                 <td className="py-3 md:py-4 text-right text-[10px] md:text-xs font-bold text-slate-500 uppercase">Units</td>
                                 {isSuperAdmin && <td className="py-3 md:py-4 text-right text-xs font-bold text-slate-600">PKR {unitPrice.toLocaleString()}</td>}
                                 {isSuperAdmin && <td className={`py-3 md:py-4 text-right text-xs md:text-sm font-black ${isItemActive ? 'text-indigo-600' : 'text-slate-400 line-through'}`}>PKR {lineTotal.toLocaleString()}</td>}
                                 <td className="py-3 md:py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[8px] md:text-[9px] font-black px-2 py-0.5 rounded-lg uppercase border ${getChallanStatusColor(itemSt)}`}>{itemSt}</span>
                                      {(isSuperAdmin || isAdmin) && isItemActive && (
                                        <button
                                          onClick={() => { setItemStatusIdx(idx); setItemStatusValue(ChallanStatus.RETURNED); setItemStatusDesc(''); }}
                                          className="text-[8px] font-black text-amber-600 hover:text-amber-800 uppercase underline underline-offset-2 no-print"
                                        >Return</button>
                                      )}
                                    </div>
                                    {item.itemStatusDescription && (
                                      <div className="text-[8px] text-slate-400 font-bold italic mt-1 max-w-[150px] truncate" title={item.itemStatusDescription}>{item.itemStatusDescription}</div>
                                    )}
                                 </td>
                              </tr>
                              {/* Inline item status change form */}
                              {itemStatusIdx === idx && (
                                <tr className="no-print">
                                  <td colSpan={isSuperAdmin ? 8 : 6} className="py-3 px-4 bg-amber-50/50 border-l-4 border-amber-400">
                                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => setItemStatusValue(ChallanStatus.RETURNED)} className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase border-2 transition-all ${itemStatusValue === ChallanStatus.RETURNED ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-400'}`}>Returned</button>
                                        <button type="button" onClick={() => setItemStatusValue(ChallanStatus.CANCELLED)} className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase border-2 transition-all ${itemStatusValue === ChallanStatus.CANCELLED ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-400'}`}>Cancelled</button>
                                      </div>
                                      <input
                                        type="text"
                                        value={itemStatusDesc}
                                        onChange={(e) => setItemStatusDesc(e.target.value)}
                                        placeholder="Reason (required)..."
                                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-xs min-w-[180px]"
                                      />
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => setItemStatusIdx(null)} className="px-3 py-1.5 rounded-lg font-black text-[9px] uppercase text-slate-500 bg-slate-100 hover:bg-slate-200">Cancel</button>
                                        <button
                                          type="button"
                                          onClick={() => { handleItemStatusChange(activeChallan, idx, itemStatusValue, itemStatusDesc); setItemStatusIdx(null); }}
                                          className="px-4 py-1.5 rounded-lg font-black text-[9px] uppercase text-white bg-indigo-600 hover:bg-indigo-700"
                                        >Confirm</button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                            );
                         })}
                      </tbody>
                      {isSuperAdmin && (
                        <tfoot className="border-t-2 border-slate-900">
                          <tr>
                            <td colSpan={5}></td>
                            <td className="py-3 md:py-4 text-right text-[10px] font-black text-slate-900 uppercase tracking-widest">Grand Total</td>
                            <td className="py-3 md:py-4 text-right text-sm font-black text-indigo-700">
                              PKR {activeChallan.items.reduce((sum, item) => {
                                const isActive = (item.itemStatus || ChallanStatus.ACTIVE) === ChallanStatus.ACTIVE;
                                if (!isActive) return sum;
                                const p = products.find(prod => prod.id === item.productId);
                                return sum + item.quantity * (p?.primaryPrice || 0);
                              }, 0).toLocaleString()}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                   </table>
                 </div>

                 <div className="grid grid-cols-2 gap-6 md:gap-12 mt-10 md:mt-20 pt-6 md:pt-12 border-t border-slate-100">
                    <div>
                       <div className="h-16 md:h-20 w-32 md:w-48 border-b-2 border-slate-900 mb-2"></div>
                       <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Consignee Signature</div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <div className="h-16 md:h-20 w-32 md:w-48 border-b-2 border-slate-900 mb-2"></div>
                       <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Signatory</div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusChangeTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg md:text-xl font-black">Change Challan Status</h2>
                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{statusChangeTarget.challanNumber}</p>
              </div>
              <button onClick={() => { setStatusChangeTarget(null); setNewChallanStatus(ChallanStatus.ACTIVE); setStatusDescription(''); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 md:p-8 space-y-4 md:space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">New Status*</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewChallanStatus(ChallanStatus.CANCELLED)} className={`px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all ${newChallanStatus === ChallanStatus.CANCELLED ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>Cancelled</button>
                  <button type="button" onClick={() => setNewChallanStatus(ChallanStatus.RETURNED)} className={`px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all ${newChallanStatus === ChallanStatus.RETURNED ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>Returned</button>
                </div>
              </div>
              {(newChallanStatus === ChallanStatus.CANCELLED || newChallanStatus === ChallanStatus.RETURNED) && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description / Reason*</label>
                  <textarea
                    value={statusDescription}
                    onChange={(e) => setStatusDescription(e.target.value)}
                    className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm resize-none h-24"
                    placeholder={newChallanStatus === ChallanStatus.CANCELLED ? "Reason for cancellation..." : "Reason for return..."}
                    required
                  />
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setStatusChangeTarget(null); setNewChallanStatus(ChallanStatus.ACTIVE); setStatusDescription(''); }} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button
                  type="button"
                  onClick={handleStatusChange}
                  disabled={newChallanStatus === ChallanStatus.ACTIVE}
                  className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Delivery Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
             <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-lg md:text-2xl font-black text-slate-900">Record Shipment</h2>
                  <p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Direct allocation to Purchase Order</p>
                </div>
                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
                  <Icons.Logout />
                </button>
             </div>

             <form onSubmit={handleSubmitDelivery} className="p-4 md:p-10 space-y-6 md:space-y-8 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Purchase Order*</label>
                      <select
                        value={selectedOrderNo}
                        onChange={(e) => handleOrderChange(e.target.value)}
                        className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner"
                        required
                      >
                         <option value="">-- Select Active PO --</option>
                         {activeOrders.map(o => (
                           <option key={o.id} value={o.orderNumber}>{o.orderNumber} ({o.date})</option>
                         ))}
                      </select>
                   </div>
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Challan ID*</label>
                      <input
                        type="text"
                        value={challanNumber}
                        onChange={(e) => setChallanNumber(e.target.value)}
                        placeholder="e.g. CH-501"
                        className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner"
                        required
                      />
                   </div>
                </div>

                {selectedOrderNo && (
                   <div className="space-y-4 pt-4 border-t border-slate-100">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Product Line Allocation</h3>
                      <div className="space-y-3 md:space-y-4">
                         {orders.find(o => o.orderNumber === selectedOrderNo)?.items.map((item, idx) => {
                           const p = products.find(prod => prod.id === item.productId);
                           const prevDelivered = deliveries
                             .reduce((s, d) => s + (d.items.filter(di => di.orderNumber === selectedOrderNo && di.productId === item.productId).reduce((is, idi) => is + idi.quantity, 0)), 0);
                           const remaining = item.quantity - prevDelivered;

                           return (
                             <div key={idx} className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[24px] border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 hover:border-indigo-200 transition-all">
                                <div className="flex-1">
                                   <div className="font-black text-slate-900 text-sm">{p?.title}</div>
                                   <div className="text-[10px] text-slate-400 font-bold mt-1">
                                      {item.quantity.toLocaleString()} Ordered • <span className="text-indigo-600">{remaining.toLocaleString()} Remaining</span>
                                   </div>
                                </div>
                                <div className="w-full md:w-40 bg-white p-3 rounded-xl md:rounded-2xl border border-slate-200">
                                   <label className="block text-[8px] font-black text-indigo-400 uppercase mb-1">Shipping Quantity</label>
                                   <input
                                     type="number"
                                     min="0"
                                     value={deliveryItems.find(i => i.productId === item.productId)?.quantity || ''}
                                     onChange={(e) => handleItemQtyChange(item.productId, parseInt(e.target.value, 10) || 0)}
                                     className="w-full px-2 py-1 bg-transparent border-none outline-none font-black text-lg text-slate-900"
                                     placeholder="0"
                                   />
                                </div>
                             </div>
                           );
                         })}
                      </div>
                   </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-6 md:pt-8 border-t border-slate-100">
                   <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                   >
                     Discard
                   </button>
                   <button
                    type="submit"
                    className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-200 transition-all active:scale-[0.98]"
                   >
                     Confirm Shipment
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
      
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { margin: 0 !important; padding: 0 !important; }
          #challan-printable { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .fixed { position: static !important; }
        }
      `}</style>
    </div>
  );
};

export default Deliveries;
