
import React, { useContext, useState, useMemo } from 'react';
import { CRMContext, generateId } from '../App';
import { DeliveryStatus, Order, UserRole } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const Orders: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter states
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Create Order Form State
  const [cart, setCart] = useState<{ productId: string, quantity: number, unitPrice: number }[]>([]);
  const [tempProduct, setTempProduct] = useState('');
  const [tempQuantity, setTempQuantity] = useState<number>(0);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [poNumber, setPoNumber] = useState('');

  // Staging state for the item current UI (temporary until "Add to Bucket")
  const [stagedInputs, setStagedInputs] = useState<Record<string, { qty: number, status: DeliveryStatus }>>({});

  if (!ctx) return null;
  const { orders, setOrders, products, currentUser, deliveries, categories, buyers, vendors, dispatchBucket, setDispatchBucket } = ctx;

  // Derive the expanded order from orders state so it always stays in sync
  const expandedOrder = expandedOrderId ? orders.find(o => o.id === expandedOrderId) || null : null;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const canCreateOrders = isSuperAdmin || isAdmin; // Only super admin and admin can create orders
  const canStageDispatch = isSuperAdmin || isAdmin; // Only super admin and admin can stage dispatch
  const myVendorId = currentUser?.vendorId;

  // Filter products for the selected supplier
  const filteredVendorProducts = useMemo(() => {
    if (!selectedVendorId) return [];
    return products.filter(p => p.primaryVendorId === selectedVendorId || p.secondaryVendorId === selectedVendorId);
  }, [selectedVendorId, products]);

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case DeliveryStatus.COMPLETE: return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case DeliveryStatus.PENDING: return 'bg-orange-50 text-orange-600 border-orange-100';
      case DeliveryStatus.PARTIAL: return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case DeliveryStatus.RETURN: return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getOverallStatus = (order: Order) => {
    if (order.items.every(i => i.status === DeliveryStatus.COMPLETE)) return DeliveryStatus.COMPLETE;
    if (order.items.every(i => i.status === DeliveryStatus.PENDING)) return DeliveryStatus.PENDING;
    if (order.items.every(i => i.status === DeliveryStatus.RETURN)) return DeliveryStatus.RETURN;
    return DeliveryStatus.PARTIAL;
  };

  // Base orders filtered by role
  const baseOrders = (isVendor || isVendorStaff)
    ? orders.filter(o => o.items.some(i => {
        const product = products.find(p => p.id === i.productId);
        return product?.primaryVendorId === myVendorId || product?.secondaryVendorId === myVendorId;
      }))
    : orders;

  // Filtered orders
  const filteredOrders = baseOrders.filter(o => {
    const matchesSearch = !searchTerm ||
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.poNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || getOverallStatus(o) === filterStatus;
    const matchesVendor = !filterVendor || o.vendorId === filterVendor;
    return matchesSearch && matchesStatus && matchesVendor;
  });

  // Validation Logic
  const isAddDisabled = !tempProduct || tempQuantity <= 0 || !selectedVendorId;
  const isSubmitDisabled = !selectedBuyerId || !selectedVendorId || cart.length === 0;

  const addToCart = () => {
    if (isAddDisabled) return;

    // One item can only be added once in the order
    if (cart.some(item => item.productId === tempProduct)) {
      alert("This item is already added. Remove it first to change quantity.");
      return;
    }

    // Get the price at the time of adding (locked in)
    const product = products.find(p => p.id === tempProduct);
    const unitPrice = product?.primaryVendorId === selectedVendorId
      ? (product.primaryPrice || 0)
      : (product?.secondaryPrice || 0);

    setCart(prev => [...prev, { productId: tempProduct, quantity: tempQuantity, unitPrice }]);
    setTempProduct('');
    setTempQuantity(0);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const totalOrderValue = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }, [cart]);

  const handleCreateOrder = async () => {
    if (isSubmitDisabled) return;

    const buyer = buyers.find(b => b.id === selectedBuyerId);
    const orderNum = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder: Order = {
      id: generateId(),
      orderNumber: orderNum,
      poNumber: poNumber || '',
      vendorId: selectedVendorId,
      date: new Date().toISOString().split('T')[0],
      buyerId: selectedBuyerId,
      placedBy: buyer?.name || 'System Auto',
      confirmedBy: 'Pending Vendor Receipt',
      items: cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: DeliveryStatus.PENDING
      })),
      totalAmount: totalOrderValue
    };

    const { error } = await db.upsertOrder(newOrder);
    if (error) {
      alert(`Failed to create order: ${error.message}`);
      return;
    }
    setOrders(prev => [newOrder, ...prev]);
    setShowCreateModal(false);
    resetOrderForm();
    alert(`Order ${orderNum} created successfully.`);
  };

  const resetOrderForm = () => {
    setCart([]);
    setSelectedBuyerId('');
    setSelectedVendorId('');
    setPoNumber('');
    setTempProduct('');
    setTempQuantity(0);
  };

  const addToBucket = (order: Order, productId: string) => {
    const input = stagedInputs[productId];
    // Should not allow negative/zero staging
    if (!input || input.qty <= 0) {
      alert("Please enter a valid positive quantity for dispatch.");
      return;
    }

    const prod = products.find(p => p.id === productId);
    const alreadyStaged = dispatchBucket.find(si => si.orderNumber === order.orderNumber && si.productId === productId);

    if (alreadyStaged) {
      alert("Line item already staged in the active bucket.");
      return;
    }

    // Check if dispatch quantity exceeds remaining ordered quantity
    const orderItem = order.items.find(i => i.productId === productId);
    if (orderItem) {
      const itemDeliveries = deliveries.filter(d => d.items.some(di => di.orderNumber === order.orderNumber && di.productId === productId));
      const totalAlreadySent = itemDeliveries.reduce((s, d) => s + (d.items.find(di => di.productId === productId)?.quantity || 0), 0);
      const remaining = orderItem.quantity - totalAlreadySent;
      if (input.qty > remaining) {
        const proceed = confirm(`Warning: Dispatching ${input.qty} exceeds the remaining ordered quantity of ${remaining} (Ordered: ${orderItem.quantity}, Already Sent: ${totalAlreadySent}). Do you want to proceed anyway?`);
        if (!proceed) return;
      }
    }

    setDispatchBucket(prev => [...prev, {
      orderNumber: order.orderNumber,
      productId,
      quantity: input.qty,
      newStatus: input.status,
      productTitle: prod?.title || 'Unknown Product'
    }]);

    setStagedInputs(prev => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Orders</h1>
          <p className="text-sm text-slate-500 mt-1">{filteredOrders.length} of {orders.length} orders</p>
        </div>
        {canCreateOrders && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wider md:tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 w-full md:w-auto"
          >
            <Icons.Plus /> Create Order
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-3 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Icons.Search />
              </span>
              <input
                type="text"
                placeholder="Search order or PO..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium min-w-[130px]"
            >
              <option value="">All Status</option>
              {Object.values(DeliveryStatus).map(status => (
                <option key={status} value={status}>{status}</option>
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
            {(filterStatus || filterVendor || searchTerm) && (
              <button
                onClick={() => { setFilterStatus(''); setFilterVendor(''); setSearchTerm(''); }}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Order Ref</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider hidden sm:table-cell">PO Number</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Vendor</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 md:px-8 py-3 md:py-5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map(o => {
                const supplier = vendors.find(s => s.id === o.vendorId);
                const isExpanded = expandedOrderId === o.id;
                return (
                  <React.Fragment key={o.id}>
                    <tr
                      onClick={() => { setExpandedOrderId(isExpanded ? null : o.id); if (isExpanded) setStagedInputs({}); }}
                      className={`cursor-pointer transition-colors group ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="px-4 md:px-8 py-4 md:py-6 font-black text-slate-900 text-sm">{o.orderNumber}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 hidden sm:table-cell"><span className="text-[10px] md:text-xs font-black text-indigo-600 bg-indigo-50 px-2 md:px-3 py-1 rounded-lg md:rounded-xl">{o.poNumber || 'N/A'}</span></td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-bold text-slate-700 max-w-[100px] truncate">{supplier?.name || 'N/A'}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-bold text-slate-500 hidden md:table-cell">{o.date}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 font-black text-slate-900 text-xs md:text-base">PKR {o.totalAmount.toLocaleString()}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6"><span className={`px-2 md:px-4 py-1 md:py-1.5 rounded-lg md:rounded-2xl text-[8px] md:text-[10px] font-black border uppercase tracking-wider ${getStatusBadge(getOverallStatus(o))}`}>{getOverallStatus(o)}</span></td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right">
                        <span className={`inline-block transition-transform duration-200 text-slate-400 ${isExpanded ? 'rotate-180 text-indigo-600' : ''}`}><Icons.ChevronDown /></span>
                      </td>
                    </tr>
                    {isExpanded && expandedOrder && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-slate-50 border-t border-indigo-100 px-4 md:px-8 py-4 md:py-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-500">
                              <span>PO Ref: <span className="text-indigo-600 font-black">{expandedOrder.poNumber || 'N/A'}</span></span>
                              <span className="text-slate-300">|</span>
                              <span>Buyer: <span className="text-indigo-600 font-black">{buyers.find(b => b.id === expandedOrder.buyerId)?.name || 'N/A'}</span></span>
                              <span className="text-slate-300">|</span>
                              <span>Placed By: <span className="text-indigo-600 font-black">{expandedOrder.placedBy}</span></span>
                            </div>

                            {/* Mobile: Card View */}
                            <div className="block md:hidden space-y-3">
                              {expandedOrder.items.map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                const itemDeliveries = deliveries.filter(d => d.items.some(di => di.orderNumber === expandedOrder.orderNumber && di.productId === item.productId));
                                const totalSent = itemDeliveries.reduce((s, d) => s + (d.items.find(di => di.productId === item.productId)?.quantity || 0), 0);
                                return (
                                  <div key={idx} className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <div className="text-sm font-black text-slate-900">{prod?.title}</div>
                                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">{prod?.unitSize || '--'}</div>
                                        <div className="text-[9px] font-black uppercase text-indigo-500 mt-1">{item.status}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-[9px] font-black text-slate-400 uppercase">Planned</div>
                                        <div className="text-sm font-black text-slate-900">{item.quantity.toLocaleString()}</div>
                                      </div>
                                    </div>
                                    {itemDeliveries.length > 0 && (
                                      <div className="bg-slate-50 rounded-lg p-2 space-y-1 border border-slate-100">
                                        <div className="text-[9px] font-black text-slate-400 uppercase">Movement Log</div>
                                        {itemDeliveries.map(d => {
                                          const delQty = d.items.find(di => di.productId === item.productId)?.quantity;
                                          return (
                                            <div key={d.id} className="text-[10px] font-bold text-slate-500 flex justify-between border-b border-slate-50 pb-1">
                                              <div>
                                                <span className="font-black text-slate-700">{d.challanNumber}</span>
                                                <span className="text-[8px] text-slate-400 ml-2">{d.deliveryDate}</span>
                                              </div>
                                              <span className="text-emerald-600 font-black">+{delQty?.toLocaleString()}</span>
                                            </div>
                                          );
                                        })}
                                        <div className="text-[10px] font-black text-slate-900 pt-1 flex justify-between">
                                          <span>FULFILLED</span>
                                          <span className="text-indigo-600 font-black">{totalSent.toLocaleString()}</span>
                                        </div>
                                      </div>
                                    )}
                                    {item.status !== DeliveryStatus.COMPLETE ? (
                                      canStageDispatch ? (
                                        <div className="flex items-end gap-2 pt-2 border-t border-slate-200">
                                          <div className="flex-1">
                                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Qty</label>
                                            <input type="number" min="0" className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 outline-none text-xs font-bold focus:ring-2 focus:ring-indigo-500" placeholder="0"
                                              value={stagedInputs[item.productId]?.qty || ''}
                                              onChange={e => setStagedInputs({...stagedInputs, [item.productId]: { qty: Math.max(0, parseInt(e.target.value, 10)) || 0, status: stagedInputs[item.productId]?.status || item.status }})}
                                            />
                                          </div>
                                          <div className="flex-1">
                                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Status</label>
                                            <select className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                              value={stagedInputs[item.productId]?.status || item.status}
                                              onChange={e => setStagedInputs({...stagedInputs, [item.productId]: { qty: stagedInputs[item.productId]?.qty || 0, status: e.target.value as DeliveryStatus }})}
                                            >
                                              {Object.values(DeliveryStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          </div>
                                          <button onClick={(e) => { e.stopPropagation(); addToBucket(expandedOrder, item.productId); }} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-90 transition-all shrink-0" title="Stage for Challan">
                                            <Icons.Plus />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="text-orange-500 text-[10px] font-black uppercase tracking-widest pt-2 border-t border-slate-200">Pending</div>
                                      )
                                    ) : (
                                      <div className="text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 pt-2 border-t border-slate-200"><Icons.Check /> Fulfilled</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Desktop: Table View */}
                            <div className="hidden md:block border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                              <table className="w-full text-left">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Details</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Size</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Plan</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Movement Log</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Stage Dispatch</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {expandedOrder.items.map((item, idx) => {
                                    const prod = products.find(p => p.id === item.productId);
                                    const itemDeliveries = deliveries.filter(d => d.items.some(di => di.orderNumber === expandedOrder.orderNumber && di.productId === item.productId));
                                    const totalSent = itemDeliveries.reduce((s, d) => s + (d.items.find(di => di.productId === item.productId)?.quantity || 0), 0);
                                    return (
                                      <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                          <div className="text-sm font-black text-slate-900">{prod?.title}</div>
                                          <div className="text-[9px] font-black uppercase text-indigo-500 mt-1">{item.status}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                          <div className="text-xs font-bold text-slate-600">{prod?.unitSize || '--'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                          <div className="text-sm font-black text-slate-900">{item.quantity.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                          <div className="space-y-1">
                                            {itemDeliveries.map(d => {
                                              const delQty = d.items.find(di => di.productId === item.productId)?.quantity;
                                              return (
                                                <div key={d.id} className="text-[10px] font-bold text-slate-500 flex justify-between border-b border-slate-50 pb-1">
                                                  <div className="flex flex-col">
                                                    <span className="font-black text-slate-700">{d.challanNumber}</span>
                                                    <span className="text-[8px] text-slate-400">{d.deliveryDate}</span>
                                                  </div>
                                                  <span className="text-emerald-600 font-black">+{delQty?.toLocaleString()}</span>
                                                </div>
                                              );
                                            })}
                                            <div className="text-[10px] font-black text-slate-900 pt-1 flex justify-between">
                                              <span>TOTAL FULFILLED</span>
                                              <span className="text-indigo-600 font-black">{totalSent.toLocaleString()}</span>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 bg-slate-50/50 text-right">
                                          {item.status !== DeliveryStatus.COMPLETE ? (
                                            canStageDispatch ? (
                                              <div className="flex items-center justify-end gap-3">
                                                <div className="relative">
                                                  <label className="absolute -top-5 left-0 text-[8px] font-black text-slate-400 uppercase">Qty</label>
                                                  <input type="number" min="0" className="w-20 px-3 py-2 rounded-xl bg-white border border-slate-200 outline-none text-xs font-bold focus:ring-2 focus:ring-indigo-500" placeholder="0"
                                                    value={stagedInputs[item.productId]?.qty || ''}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => setStagedInputs({...stagedInputs, [item.productId]: { qty: Math.max(0, parseInt(e.target.value, 10)) || 0, status: stagedInputs[item.productId]?.status || item.status }})}
                                                  />
                                                </div>
                                                <div className="relative">
                                                  <label className="absolute -top-5 left-0 text-[8px] font-black text-slate-400 uppercase">Status</label>
                                                  <select className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                                    value={stagedInputs[item.productId]?.status || item.status}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => setStagedInputs({...stagedInputs, [item.productId]: { qty: stagedInputs[item.productId]?.qty || 0, status: e.target.value as DeliveryStatus }})}
                                                  >
                                                    {Object.values(DeliveryStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                  </select>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); addToBucket(expandedOrder, item.productId); }} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-90 transition-all" title="Stage for Challan">
                                                  <Icons.Plus />
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="text-orange-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-end gap-2">Pending</div>
                                            )
                                          ) : (
                                            <div className="text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-end gap-2"><Icons.Check /> Fulfilled</div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
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

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
             <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-lg md:text-2xl font-black text-slate-900">New Purchase Order</h2>
                  <p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-wider">Vendor & line items</p>
                </div>
                <button onClick={() => { setShowCreateModal(false); resetOrderForm(); }} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
                  <Icons.Logout />
                </button>
             </div>
             
             <div className="p-4 md:p-10 space-y-6 md:space-y-10 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  <div className="group">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">PO Ref Code <span className="text-slate-300 normal-case">(optional)</span></label>
                     <input 
                       type="text" 
                       value={poNumber} 
                       onChange={(e) => setPoNumber(e.target.value)} 
                       className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" 
                       placeholder="e.g. PO-882" 
                     />
                  </div>
                  <div className="group">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Assigned Buyer*</label>
                    <select 
                      value={selectedBuyerId} 
                      onChange={(e) => setSelectedBuyerId(e.target.value)} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" 
                      required
                    >
                      <option value="">-- Officer --</option>
                      {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="group">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Select Vendor*</label>
                    <select 
                      value={selectedVendorId} 
                      onChange={(e) => { setSelectedVendorId(e.target.value); setCart([]); }} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" 
                      required
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className={`p-4 md:p-8 rounded-2xl md:rounded-[32px] transition-all grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 ${selectedVendorId ? 'bg-indigo-600 shadow-2xl shadow-indigo-200' : 'bg-slate-100 grayscale opacity-60'}`}>
                   <div className="md:col-span-2">
                      <label className="block text-[10px] font-black text-indigo-200 uppercase mb-2 tracking-widest">Vendor Product SKU</label>
                      <select 
                        disabled={!selectedVendorId}
                        value={tempProduct} 
                        onChange={(e) => setTempProduct(e.target.value)} 
                        className="w-full px-4 py-3 rounded-xl border-none bg-white/10 text-white outline-none text-sm font-bold backdrop-blur-md disabled:cursor-not-allowed"
                      >
                         <option value="" className="text-slate-900">-- Choose Item --</option>
                         {filteredVendorProducts.map(p => <option key={p.id} value={p.id} className="text-slate-900">{p.title}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-indigo-200 uppercase mb-2 tracking-widest">Quantity</label>
                      <input 
                        disabled={!selectedVendorId}
                        type="number" 
                        min="1"
                        value={tempQuantity || ''} 
                        onChange={(e) => setTempQuantity(Math.max(0, parseInt(e.target.value, 10)) || 0)} 
                        className="w-full px-4 py-3 rounded-xl border-none bg-white/10 text-white outline-none text-sm font-bold backdrop-blur-md placeholder-indigo-300" 
                        placeholder="0" 
                      />
                   </div>
                   <button 
                     type="button" 
                     onClick={addToCart} 
                     disabled={isAddDisabled}
                     className={`md:col-span-3 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${isAddDisabled ? 'bg-white/20 text-white/40 cursor-not-allowed' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}
                   >
                     <Icons.Plus /> Add Line Item
                   </button>
                </div>

                <div className="space-y-4">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex justify-between">
                     <span>Current Selection</span>
                     <span>{cart.length} Products</span>
                   </h3>
                   {cart.map((item, idx) => {
                     const p = products.find(prod => prod.id === item.productId);
                     return (
                       <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-[24px] hover:border-indigo-200 transition-all group/item gap-3">
                          <div className="flex-1 min-w-0">
                             <div className="font-black text-slate-900 text-sm truncate">{p?.title}</div>
                             <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">{p?.category}</div>
                          </div>
                          <div className="flex items-center gap-4 md:gap-6">
                             <div className="text-left sm:text-right">
                                <div className="text-sm font-black text-slate-900">{item.quantity.toLocaleString()} units</div>
                                <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">@ PKR {item.unitPrice.toFixed(2)} / unit</div>
                             </div>
                             <button onClick={() => removeFromCart(idx)} className="text-slate-300 p-2 md:p-3 hover:bg-rose-50 hover:text-rose-400 rounded-xl md:rounded-2xl transition-all shrink-0">
                                <Icons.Logout />
                             </button>
                          </div>
                       </div>
                     );
                   })}
                   {cart.length === 0 && (
                     <div className="py-20 text-center text-slate-400 italic bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
                        <Icons.Products />
                        <div className="mt-2 text-[10px] font-black uppercase tracking-widest">Cart is empty. Select a vendor and add items.</div>
                     </div>
                   )}
                </div>
             </div>

             <div className="p-4 md:p-10 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 shrink-0">
                <div className="text-center md:text-left w-full md:w-auto">
                  <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</div>
                  <div className="text-2xl md:text-4xl font-black text-slate-900 mt-1">PKR {totalOrderValue.toLocaleString()}</div>
                </div>
                <div className="flex gap-3 md:gap-4 w-full md:w-auto">
                   <button
                    onClick={() => { setShowCreateModal(false); resetOrderForm(); }}
                    className="flex-1 md:flex-none px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-[24px] font-black text-[10px] md:text-xs uppercase tracking-wider text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 transition-all shadow-sm"
                   >
                     Discard
                   </button>
                   <button
                    onClick={handleCreateOrder}
                    disabled={isSubmitDisabled}
                    className={`flex-1 md:flex-none px-8 md:px-12 py-3 md:py-5 rounded-xl md:rounded-[24px] font-black text-[10px] md:text-xs uppercase tracking-wider text-white shadow-2xl transition-all active:scale-[0.98] ${isSubmitDisabled ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-60' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                   >
                     Submit
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Orders;
