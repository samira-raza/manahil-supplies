
import React, { useContext, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CRMContext, generateId } from '../App';
import { UserRole, Vendor, Product, BankAccount, Payment, Order, Delivery, DeliveryStatus, ChallanStatus } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const VendorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useContext(CRMContext);

  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [viewingDelivery, setViewingDelivery] = useState<Delivery | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'cash' as 'cash' | 'bank',
    bankAccount: '',
    reference: '',
    note: ''
  });

  const [adjustmentForm, setAdjustmentForm] = useState({
    amount: '',
    type: 'increase' as 'increase' | 'decrease',
    note: ''
  });

  if (!ctx) return null;
  const { vendors, setVendors, currentUser, products, deliveries, orders, buyers, payments, setPayments } = ctx;

  const vendor = vendors.find(v => v.id === id);
  if (!vendor) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-6xl font-black text-slate-200">404</div>
        <div className="text-sm font-bold text-slate-400">Vendor not found</div>
        <button onClick={() => navigate('/suppliers')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all">Back to Vendors</button>
      </div>
    );
  }

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const canAddVendors = isSuperAdmin || isAdmin;
  const canEditPayments = isSuperAdmin;

  // Financial breakdown
  const getFinancials = () => {
    const openingBalance = vendor.openingBalance || 0;

    const activeStatuses = [ChallanStatus.ACTIVE, ChallanStatus.PARTIAL_RETURNED];
    const supplierDeliveries = deliveries.filter(d =>
      activeStatuses.includes(d.challanStatus || ChallanStatus.ACTIVE) &&
      d.items.some(di => {
        const prod = products.find(p => p.id === di.productId);
        return prod?.primaryVendorId === vendor.id;
      })
    );

    const totalDeliveredValue = supplierDeliveries.reduce((sum, d) => {
      const dValue = d.items.reduce((iSum, item) => {
        if ((item.itemStatus || ChallanStatus.ACTIVE) !== ChallanStatus.ACTIVE) return iSum;
        const prod = products.find(p => p.id === item.productId);
        if (prod?.primaryVendorId === vendor.id) {
          return iSum + (item.quantity * (prod.primaryPrice || 0));
        }
        return iSum;
      }, 0);
      return sum + dValue;
    }, 0);

    const vendorPayments = payments.filter(p => p.vendorId === vendor.id);
    const regularPayments = vendorPayments.filter(p => p.method !== 'adjustment');
    const adjustments = vendorPayments.filter(p => p.method === 'adjustment');

    const totalPaid = regularPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalAdjustments = adjustments.reduce((sum, p) => sum + p.amount, 0);

    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const dueNowPotential = supplierDeliveries.reduce((sum, d) => {
      const dDate = new Date(d.deliveryDate);
      if (dDate <= fortyFiveDaysAgo) {
        const dValue = d.items.reduce((iSum, item) => {
          if ((item.itemStatus || ChallanStatus.ACTIVE) !== ChallanStatus.ACTIVE) return iSum;
          const prod = products.find(p => p.id === item.productId);
          if (prod?.primaryVendorId === vendor.id) return iSum + (item.quantity * (prod.primaryPrice || 0));
          return iSum;
        }, 0);
        return sum + dValue;
      }
      return sum;
    }, 0);

    const netPayable = openingBalance + totalDeliveredValue - totalPaid - totalAdjustments;
    const minimumPayable = Math.max(0, dueNowPotential - totalPaid);

    const monthlyData: Record<string, { sales: number, payments: number }> = {};
    supplierDeliveries.forEach(d => {
      const month = d.deliveryDate.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { sales: 0, payments: 0 };
      const dVal = d.items.reduce((iSum, item) => {
        if ((item.itemStatus || ChallanStatus.ACTIVE) !== ChallanStatus.ACTIVE) return iSum;
        const prod = products.find(p => p.id === item.productId);
        return prod?.primaryVendorId === vendor.id ? iSum + (item.quantity * (prod.primaryPrice || 0)) : iSum;
      }, 0);
      monthlyData[month].sales += dVal;
    });

    regularPayments.forEach(p => {
      const month = p.date.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { sales: 0, payments: 0 };
      monthlyData[month].payments += p.amount;
    });

    return { totalDeliveredValue, totalPaid, totalAdjustments, netPayable, minimumPayable, monthlyData, openingBalance };
  };

  const financials = getFinancials();

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount) return;
    const newPayment: Payment = {
      id: generateId(),
      vendorId: vendor.id,
      amount: parseFloat(paymentForm.amount),
      date: new Date().toISOString().split('T')[0],
      method: paymentForm.method,
      bankAccount: paymentForm.method === 'bank' ? paymentForm.bankAccount : undefined,
      reference: paymentForm.reference,
      note: paymentForm.note
    };
    await db.insertPayment(newPayment);
    setPayments(prev => [...prev, newPayment]);
    setShowPaymentModal(false);
    setPaymentForm({ amount: '', method: 'cash', bankAccount: '', reference: '', note: '' });
  };

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentForm.amount) return;
    const rawAmount = parseFloat(adjustmentForm.amount);
    const adjustedAmount = adjustmentForm.type === 'decrease' ? rawAmount : -rawAmount;
    const newPayment: Payment = {
      id: generateId(),
      vendorId: vendor.id,
      amount: adjustedAmount,
      date: new Date().toISOString().split('T')[0],
      method: 'adjustment',
      note: adjustmentForm.note || (adjustmentForm.type === 'increase' ? 'Balance increase adjustment' : 'Balance decrease adjustment')
    };
    await db.insertPayment(newPayment);
    setPayments(prev => [...prev, newPayment]);
    setShowAdjustmentModal(false);
    setAdjustmentForm({ amount: '', type: 'increase', note: '' });
  };

  const vendorDeliveries = deliveries
    .filter(d => d.items.some(di => {
      const prod = products.find(p => p.id === di.productId);
      return prod?.primaryVendorId === vendor.id;
    }))
    .sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());

  const vendorPaymentsList = payments.filter(p => p.vendorId === vendor.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={() => navigate('/suppliers')} className="p-2 md:p-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl hover:bg-slate-50 transition-all shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{vendor.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{vendor.primaryContactName} &middot; {vendor.primaryMobile}</p>
          </div>
        </div>
        <div className="flex flex-row gap-2 w-full md:w-auto">
          {canAddVendors && (
            <button onClick={() => setEditingVendor(vendor)} className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-white border border-slate-200 text-slate-600 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wider hover:bg-slate-50 transition-all">
              Edit Vendor
            </button>
          )}
          {canEditPayments && (
            <button onClick={() => setShowPaymentModal(true)} className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wider shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
              Post Payment
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={() => setShowAdjustmentModal(true)} className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-amber-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wider shadow-xl shadow-amber-100 hover:bg-amber-600 transition-all">
              Adjustment
            </button>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {financials.openingBalance !== 0 && (
          <div className="p-3 md:p-6 bg-violet-50 rounded-xl md:rounded-3xl border border-violet-100">
            <div className="text-[8px] md:text-[10px] font-black text-violet-500 uppercase tracking-wider mb-1 md:mb-2">Opening Bal.</div>
            <div className="text-sm md:text-2xl font-black text-violet-600">{financials.openingBalance.toLocaleString()}</div>
          </div>
        )}
        <div className="p-3 md:p-6 bg-slate-50 rounded-xl md:rounded-3xl border border-slate-100">
          <div className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 md:mb-2">Delivered</div>
          <div className="text-sm md:text-2xl font-black text-slate-900">{financials.totalDeliveredValue.toLocaleString()}</div>
        </div>
        <div className="p-3 md:p-6 bg-emerald-50 rounded-xl md:rounded-3xl border border-emerald-100">
          <div className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-1 md:mb-2">Paid</div>
          <div className="text-sm md:text-2xl font-black text-emerald-600">{financials.totalPaid.toLocaleString()}</div>
        </div>
        {financials.totalAdjustments !== 0 && (
          <div className="p-3 md:p-6 bg-amber-50 rounded-xl md:rounded-3xl border border-amber-100">
            <div className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-wider mb-1 md:mb-2">Adjustments</div>
            <div className="text-sm md:text-2xl font-black text-amber-600">{financials.totalAdjustments.toLocaleString()}</div>
          </div>
        )}
        <div className="p-3 md:p-6 bg-rose-50 rounded-xl md:rounded-3xl border border-rose-100">
          <div className="text-[8px] md:text-[10px] font-black text-rose-500 uppercase tracking-wider mb-1 md:mb-2">Balance</div>
          <div className="text-sm md:text-2xl font-black text-rose-600">{financials.netPayable.toLocaleString()}</div>
        </div>
        <div className="p-3 md:p-6 bg-indigo-600 rounded-xl md:rounded-3xl shadow-xl shadow-indigo-100 text-white">
          <div className="text-[8px] md:text-[10px] font-black text-indigo-200 uppercase tracking-wider mb-1 md:mb-2">Overdue</div>
          <div className="text-sm md:text-2xl font-black">{financials.minimumPayable.toLocaleString()}</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100">
          <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">Monthly Breakdown</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[400px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Month</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Sales</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Payments</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.keys(financials.monthlyData).sort().reverse().map(m => {
                const data = financials.monthlyData[m];
                return (
                  <tr key={m}>
                    <td className="px-6 py-4 font-black text-slate-900">{m}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-600">PKR {data.sales.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">PKR {data.payments.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900">PKR {(data.sales - data.payments).toLocaleString()}</td>
                  </tr>
                );
              })}
              {Object.keys(financials.monthlyData).length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-xs italic">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales / Delivery History */}
      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100">
          <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Sales / Delivery History</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Date</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Challan</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Order</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Product</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase text-right">Qty</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase text-right">Value</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendorDeliveries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 md:px-6 py-8 text-center text-slate-400 text-xs italic">No delivery records found for this vendor.</td></tr>
              ) : vendorDeliveries.map(d => {
                const relevantItems = d.items.filter(di => {
                  const prod = products.find(p => p.id === di.productId);
                  return prod?.primaryVendorId === vendor.id;
                });
                return relevantItems.map((item, idx) => {
                  const prod = products.find(p => p.id === item.productId);
                  const itemActive = (item.itemStatus || ChallanStatus.ACTIVE) === ChallanStatus.ACTIVE;
                  const lineValue = itemActive ? item.quantity * (prod?.primaryPrice || 0) : 0;
                  const linkedOrder = orders.find(o => o.orderNumber === item.orderNumber);
                  return (
                    <tr key={`${d.id}-${idx}`} className={`hover:bg-slate-50/80 transition-all ${!itemActive ? 'opacity-60' : ''}`}>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-bold text-slate-700">{d.deliveryDate}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <span className="text-[9px] md:text-[10px] font-black bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">{d.challanNumber}</span>
                        {!itemActive && (
                          <span className={`ml-1 text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${(item.itemStatus) === ChallanStatus.CANCELLED ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{item.itemStatus}</span>
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <span className="text-[9px] md:text-[10px] font-black bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">{item.orderNumber}</span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium text-slate-700 truncate max-w-[180px]">{prod?.itemName || prod?.title || '--'}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-black text-slate-900 text-right">{item.quantity.toLocaleString()}</td>
                      <td className={`px-4 md:px-6 py-3 md:py-4 text-sm font-black text-right ${itemActive ? 'text-indigo-600' : 'text-slate-400 line-through'}`}>PKR {lineValue.toLocaleString()}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right space-x-2">
                        {linkedOrder && (
                          <button onClick={() => setViewingOrder(linkedOrder)} className="text-[10px] md:text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors underline underline-offset-2">View Order</button>
                        )}
                        <button onClick={() => setViewingDelivery(d)} className="text-[10px] md:text-xs font-bold text-emerald-500 hover:text-emerald-700 transition-colors underline underline-offset-2">View Delivery</button>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment & Adjustment History */}
      <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100">
          <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">Payment & Adjustment History</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Date</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Amount</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Type</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase">Reference / Note</th>
                {isSuperAdmin && <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-400 uppercase text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendorPaymentsList.length === 0 ? (
                <tr><td colSpan={isSuperAdmin ? 5 : 4} className="px-4 md:px-6 py-8 text-center text-slate-400 text-xs italic">No payments recorded for this vendor.</td></tr>
              ) : vendorPaymentsList.map(p => (
                <tr key={p.id} className={`hover:bg-slate-50/80 transition-all ${p.method === 'adjustment' ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-sm font-bold text-slate-700">{p.date}</td>
                  <td className={`px-4 md:px-6 py-3 md:py-4 text-sm font-black ${p.method === 'adjustment' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    PKR {Math.abs(p.amount).toLocaleString()}
                    {p.method === 'adjustment' && (
                      <span className="text-[9px] ml-1 font-bold">{p.amount > 0 ? '(-)' : '(+)'}</span>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4">
                    {p.method === 'adjustment' ? (
                      <span className="text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-700">Adjustment</span>
                    ) : (
                      <>
                        <span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded uppercase ${p.method === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                          {p.method === 'bank' ? 'Bank' : 'Cash'}
                        </span>
                        {p.method === 'bank' && p.bankAccount && (
                          <div className="text-[9px] md:text-[10px] text-slate-400 font-bold mt-1 truncate max-w-[150px]">{p.bankAccount}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 md:py-4 text-xs text-slate-500 font-medium">{p.reference || p.note || '--'}</td>
                  {isSuperAdmin && (
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                      {p.method !== 'adjustment' && (
                        <button onClick={() => setEditingPayment(p)} className="text-[10px] md:text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">Edit</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (() => {
        const vendorBanks = vendor.bankAccounts || [];
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
            <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  <h2 className="text-lg md:text-xl font-black">Post Payment</h2>
                  <p className="text-[9px] md:text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{vendor.name}</p>
                </div>
                <button onClick={() => { setShowPaymentModal(false); setPaymentForm({ amount: '', method: 'cash', bankAccount: '', reference: '', note: '' }); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={handleRecordPayment} className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (PKR)*</label>
                  <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-base md:text-lg" required />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Method*</label>
                  <select value={paymentForm.method} onChange={(e) => setPaymentForm({...paymentForm, method: e.target.value as 'cash' | 'bank', bankAccount: ''})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm">
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                {paymentForm.method === 'bank' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Account*</label>
                    {vendorBanks.length > 0 ? (
                      <select value={paymentForm.bankAccount} onChange={(e) => setPaymentForm({...paymentForm, bankAccount: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" required>
                        <option value="">-- Select Bank Account --</option>
                        {vendorBanks.map((bank, idx) => (
                          <option key={idx} value={`${bank.bankTitle} - ${bank.accountNumber}`}>{bank.bankTitle} - {bank.accountTitle} ({bank.accountNumber})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">No bank accounts found. Please add bank details to this vendor first.</div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reference / Note</label>
                  <input type="text" value={paymentForm.reference} onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="e.g. Cheque #1234" />
                </div>
                <button type="submit" disabled={paymentForm.method === 'bank' && (!paymentForm.bankAccount || vendorBanks.length === 0)} className="w-full py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-[24px] font-black text-base md:text-lg shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Record Transaction</button>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Adjustment Modal */}
      {showAdjustmentModal && isSuperAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 md:p-8 border-b border-slate-100 bg-amber-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg md:text-xl font-black">Post Adjustment</h2>
                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{vendor.name}</p>
              </div>
              <button onClick={() => { setShowAdjustmentModal(false); setAdjustmentForm({ amount: '', type: 'increase', note: '' }); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleRecordAdjustment} className="p-4 md:p-8 space-y-4 md:space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Adjustment Type*</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setAdjustmentForm({...adjustmentForm, type: 'decrease'})} className={`px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all ${adjustmentForm.type === 'decrease' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>Decrease Balance</button>
                  <button type="button" onClick={() => setAdjustmentForm({...adjustmentForm, type: 'increase'})} className={`px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all ${adjustmentForm.type === 'increase' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>Increase Balance</button>
                </div>
                <p className="text-[9px] text-slate-400 font-bold mt-2">{adjustmentForm.type === 'decrease' ? 'Reduces the pending amount (e.g. discount, write-off, correction)' : 'Increases the pending amount (e.g. missed invoice, correction)'}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (PKR)*</label>
                <input type="number" step="0.01" min="0.01" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({...adjustmentForm, amount: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-amber-500 outline-none font-bold text-base md:text-lg" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reason / Note*</label>
                <input type="text" value={adjustmentForm.note} onChange={(e) => setAdjustmentForm({...adjustmentForm, note: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-amber-500 outline-none font-bold text-sm" placeholder="e.g. Discount agreed, Correction for invoice #123" required />
              </div>
              <button type="submit" className="w-full py-4 md:py-5 bg-amber-500 text-white rounded-xl md:rounded-[24px] font-black text-base md:text-lg shadow-xl hover:bg-amber-600 transition-all">Record Adjustment</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Vendor Modal */}
      {editingVendor && (
        <EditVendorModal
          vendor={editingVendor}
          isSuperAdmin={!!isSuperAdmin}
          onClose={() => setEditingVendor(null)}
          onSave={async (updated) => {
            await db.upsertVendor(updated);
            setVendors(prev => prev.map(v => v.id === updated.id ? updated : v));
            setEditingVendor(null);
          }}
        />
      )}

      {/* Edit Payment Modal */}
      {editingPayment && isSuperAdmin && (
        <EditPaymentModal
          payment={editingPayment}
          vendorBanks={vendor.bankAccounts || []}
          vendorName={vendor.name}
          onClose={() => setEditingPayment(null)}
          onSave={async (updated) => {
            await db.upsertPayment(updated);
            setPayments(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditingPayment(null);
          }}
        />
      )}

      {/* View Order Modal */}
      {viewingOrder && (
        <ViewOrderModal order={viewingOrder} products={products} vendors={vendors} buyers={buyers} onClose={() => setViewingOrder(null)} />
      )}

      {/* View Delivery Modal */}
      {viewingDelivery && (
        <ViewDeliveryModal delivery={viewingDelivery} products={products} orders={orders} onClose={() => setViewingDelivery(null)} />
      )}
    </div>
  );
};

// ===== Sub-Components (moved from Suppliers.tsx) =====

const EditPaymentModal: React.FC<{
  payment: Payment; vendorBanks: BankAccount[]; vendorName: string; onClose: () => void; onSave: (updated: Payment) => void;
}> = ({ payment, vendorBanks, vendorName, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    amount: payment.amount.toString(), method: (payment.method || 'cash') as 'cash' | 'bank',
    bankAccount: payment.bankAccount || '', reference: payment.reference || '', note: payment.note || '', date: payment.date,
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount) return;
    onSave({ ...payment, amount: parseFloat(formData.amount), method: formData.method, bankAccount: formData.method === 'bank' ? formData.bankAccount : undefined, reference: formData.reference, note: formData.note, date: formData.date });
  };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 max-h-[95vh] flex flex-col">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div><h2 className="text-lg md:text-xl font-black">Edit Payment</h2><p className="text-[9px] md:text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{vendorName}</p></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto flex-1">
          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date*</label><input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" required /></div>
          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (PKR)*</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-base md:text-lg" required /></div>
          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Method*</label><select value={formData.method} onChange={(e) => setFormData({...formData, method: e.target.value as 'cash' | 'bank', bankAccount: ''})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"><option value="cash">Cash</option><option value="bank">Bank Transfer</option></select></div>
          {formData.method === 'bank' && <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Account*</label>{vendorBanks.length > 0 ? <select value={formData.bankAccount} onChange={(e) => setFormData({...formData, bankAccount: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" required><option value="">-- Select --</option>{vendorBanks.map((b, i) => <option key={i} value={`${b.bankTitle} - ${b.accountNumber}`}>{b.bankTitle} - {b.accountTitle} ({b.accountNumber})</option>)}</select> : <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">No bank accounts found.</div>}</div>}
          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reference / Note</label><input type="text" value={formData.reference} onChange={(e) => setFormData({...formData, reference: e.target.value})} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="e.g. Cheque #1234" /></div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-4 md:pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px]">Cancel</button>
            <button type="submit" disabled={formData.method === 'bank' && (!formData.bankAccount || vendorBanks.length === 0)} className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditVendorModal: React.FC<{
  vendor: Vendor; isSuperAdmin: boolean; onClose: () => void; onSave: (updated: Vendor) => void;
}> = ({ vendor, isSuperAdmin, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: vendor.name, primaryContactName: vendor.primaryContactName, primaryMobile: vendor.primaryMobile,
    email: vendor.contact.email, address: vendor.contact.address, openingBalance: (vendor.openingBalance || 0).toString(),
    bankAccounts: vendor.bankAccounts.length > 0 ? vendor.bankAccounts.map(b => ({ ...b })) : [{ bankTitle: '', accountTitle: '', branchName: '', accountNumber: '', ifsc: '' }] as BankAccount[],
  });
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const handleBankChange = (index: number, field: keyof BankAccount, value: string) => { const u = [...formData.bankAccounts]; u[index] = { ...u[index], [field]: value }; setFormData(prev => ({ ...prev, bankAccounts: u })); };
  const addBankField = () => setFormData(prev => ({ ...prev, bankAccounts: [...prev.bankAccounts, { bankTitle: '', accountTitle: '', branchName: '', accountNumber: '', ifsc: '' }] }));
  const removeBankField = (i: number) => { if (formData.bankAccounts.length === 1) return; setFormData(prev => ({ ...prev, bankAccounts: prev.bankAccounts.filter((_, idx) => idx !== i) })); };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...vendor, name: formData.name, primaryContactName: formData.primaryContactName, primaryMobile: formData.primaryMobile, openingBalance: isSuperAdmin && formData.openingBalance ? parseFloat(formData.openingBalance) : vendor.openingBalance || 0, bankAccounts: formData.bankAccounts.filter(b => b.accountNumber && b.bankTitle), contact: { phone: formData.primaryMobile, email: formData.email, address: formData.address } });
  };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div><h2 className="text-lg md:text-2xl font-black text-slate-900">Edit Vendor</h2><p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Update vendor details & bank info</p></div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors"><svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-10 space-y-6 md:space-y-8 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="group md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Company Name*</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" required /></div>
            <div className="group"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Contact Person*</label><input type="text" name="primaryContactName" value={formData.primaryContactName} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" required /></div>
            <div className="group"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Mobile*</label><input type="tel" name="primaryMobile" value={formData.primaryMobile} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" required /></div>
            <div className="group"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Email</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" /></div>
            <div className="group"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Address</label><input type="text" name="address" value={formData.address} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" /></div>
            {isSuperAdmin && <div className="group"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Opening Balance (PKR)</label><input type="number" step="0.01" name="openingBalance" value={formData.openingBalance} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="0.00" /></div>}
          </div>
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Accounts</h3><button type="button" onClick={addBankField} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">+ Add Bank</button></div>
            {formData.bankAccounts.map((bank, idx) => (
              <div key={idx} className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[24px] border border-slate-100 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black text-slate-400 uppercase">Bank #{idx + 1}</span>{formData.bankAccounts.length > 1 && <button type="button" onClick={() => removeBankField(idx)} className="text-[10px] font-black text-red-500 uppercase hover:text-red-700 transition-colors">Remove</button>}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <input type="text" value={bank.bankTitle} onChange={(e) => handleBankChange(idx, 'bankTitle', e.target.value)} className="w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="Bank name" />
                  <input type="text" value={bank.accountTitle} onChange={(e) => handleBankChange(idx, 'accountTitle', e.target.value)} className="w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="Account title" />
                  <input type="text" value={bank.branchName} onChange={(e) => handleBankChange(idx, 'branchName', e.target.value)} className="w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="Branch name" />
                  <input type="text" value={bank.accountNumber} onChange={(e) => handleBankChange(idx, 'accountNumber', e.target.value)} className="w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="Account number" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 md:gap-4 pt-6 md:pt-8 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
            <button type="submit" className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-200 transition-all active:scale-[0.98]">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ViewOrderModal: React.FC<{
  order: Order; products: Product[]; vendors: Vendor[]; buyers: { id: string; name: string; contactNumber: string }[]; onClose: () => void;
}> = ({ order, products, vendors, buyers, onClose }) => {
  const vendorObj = vendors.find(v => v.id === order.vendorId);
  const buyer = buyers.find(b => b.id === order.buyerId);
  const getStatusColor = (status: DeliveryStatus) => { switch (status) { case DeliveryStatus.COMPLETE: return 'bg-emerald-100 text-emerald-700'; case DeliveryStatus.PARTIAL: return 'bg-amber-100 text-amber-700'; case DeliveryStatus.RETURN: return 'bg-rose-100 text-rose-700'; default: return 'bg-slate-100 text-slate-600'; } };
  const overallStatus = order.items.length === 0 ? 'Pending' : order.items.every(i => i.status === DeliveryStatus.COMPLETE) ? 'Complete' : order.items.every(i => i.status === DeliveryStatus.PENDING) ? 'Pending' : 'Partial';
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div><h2 className="text-lg md:text-2xl font-black text-slate-900">Order Details</h2><p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Docket #{order.orderNumber}</p></div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors"><svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="p-4 md:p-8 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Order #</div><div className="text-sm font-black text-slate-900">{order.orderNumber}</div></div>
            {order.poNumber && <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">PO Number</div><div className="text-sm font-bold text-slate-700">{order.poNumber}</div></div>}
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Date</div><div className="text-sm font-bold text-slate-700">{order.date}</div></div>
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Vendor</div><div className="text-sm font-bold text-slate-700">{vendorObj?.name || '--'}</div></div>
            {buyer && <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Buyer</div><div className="text-sm font-bold text-slate-700">{buyer.name}</div></div>}
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Status</div><span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${overallStatus === 'Complete' ? 'bg-emerald-100 text-emerald-700' : overallStatus === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{overallStatus}</span></div>
          </div>
          <div className="p-4 md:p-6 bg-indigo-50 rounded-2xl border border-indigo-100"><div className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1">Total Amount</div><div className="text-xl md:text-2xl font-black text-indigo-700">PKR {order.totalAmount.toLocaleString()}</div></div>
          <div>
            <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Order Items</h4>
            <div className="border border-slate-200 rounded-xl md:rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left min-w-[450px]"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Product</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-right">Qty</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-right">Unit Price</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-right">Total</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{order.items.map((item, idx) => { const prod = products.find(p => p.id === item.productId); return (<tr key={idx} className="hover:bg-slate-50/80"><td className="px-4 md:px-6 py-3 text-xs md:text-sm font-medium text-slate-700">{prod?.title || '--'}</td><td className="px-4 md:px-6 py-3 text-sm font-black text-slate-900 text-right">{item.quantity}</td><td className="px-4 md:px-6 py-3 text-sm font-bold text-slate-600 text-right">PKR {item.unitPrice.toLocaleString()}</td><td className="px-4 md:px-6 py-3 text-sm font-black text-indigo-600 text-right">PKR {(item.quantity * item.unitPrice).toLocaleString()}</td><td className="px-4 md:px-6 py-3"><span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${getStatusColor(item.status)}`}>{item.status}</span></td></tr>); })}</tbody></table>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-slate-400"><div><span className="font-black uppercase tracking-wider">Placed by:</span> <span className="font-bold text-slate-600 ml-1">{order.placedBy || '--'}</span></div><div><span className="font-black uppercase tracking-wider">Confirmed by:</span> <span className="font-bold text-slate-600 ml-1">{order.confirmedBy || '--'}</span></div></div>
        </div>
      </div>
    </div>
  );
};

const ViewDeliveryModal: React.FC<{
  delivery: Delivery; products: Product[]; orders: Order[]; onClose: () => void;
}> = ({ delivery, products, orders, onClose }) => {
  const totalUnits = delivery.items.reduce((sum, i) => sum + i.quantity, 0);
  const uniqueOrderNumbers = [...new Set(delivery.items.map(i => i.orderNumber))];
  const getStatusColor = (status: DeliveryStatus) => { switch (status) { case DeliveryStatus.COMPLETE: return 'bg-emerald-100 text-emerald-700'; case DeliveryStatus.PARTIAL: return 'bg-amber-100 text-amber-700'; case DeliveryStatus.RETURN: return 'bg-rose-100 text-rose-700'; default: return 'bg-slate-100 text-slate-600'; } };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div><h2 className="text-lg md:text-2xl font-black text-slate-900">Delivery Challan</h2><p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{delivery.challanNumber}</p></div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors"><svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="p-4 md:p-8 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Challan #</div><div className="text-sm font-black text-slate-900">{delivery.challanNumber}</div></div>
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Delivery Date</div><div className="text-sm font-bold text-slate-700">{delivery.deliveryDate}</div></div>
            <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Units</div><div className="text-sm font-black text-slate-900">{totalUnits.toLocaleString()}</div></div>
          </div>
          <div><div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Related Orders</div><div className="flex flex-wrap gap-2">{uniqueOrderNumbers.map(on => <span key={on} className="text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1 rounded-full">{on}</span>)}</div></div>
          <div>
            <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Delivery Items</h4>
            <div className="border border-slate-200 rounded-xl md:rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left min-w-[500px]"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Product</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Order Ref</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-right">Qty</th><th className="px-4 md:px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{delivery.items.map((item, idx) => { const prod = products.find(p => p.id === item.productId); return (<tr key={idx} className="hover:bg-slate-50/80"><td className="px-4 md:px-6 py-3"><div className="text-xs md:text-sm font-medium text-slate-700">{prod?.title || '--'}</div>{prod?.category && <div className="text-[9px] text-slate-400 font-bold mt-0.5">{prod.category}</div>}</td><td className="px-4 md:px-6 py-3"><span className="text-[9px] md:text-[10px] font-black bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">{item.orderNumber}</span></td><td className="px-4 md:px-6 py-3 text-sm font-black text-slate-900 text-right">{item.quantity.toLocaleString()}</td><td className="px-4 md:px-6 py-3"><span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${getStatusColor(item.newStatus)}`}>{item.newStatus}</span></td></tr>); })}</tbody></table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorDetail;
