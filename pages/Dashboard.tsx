
import React, { useContext, useEffect, useState } from 'react';
import { CRMContext } from '../App';
import { DeliveryStatus, UserRole } from '../types';
import { generateInsights } from '../services/gemini';
import { Icons } from '../constants';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const Dashboard: React.FC = () => {
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();
  const [aiInsights, setAiInsights] = useState<string>('Loading business intelligence...');
  const [refreshKey, setRefreshKey] = useState(0);
  
  if (!ctx) return null;
  const { orders, vendors, products, currentUser } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const isSupplierRole = isVendor || isVendorStaff;
  const mySupplierId = currentUser?.vendorId;

  useEffect(() => {
    const fetchAI = async () => {
      setAiInsights('Refreshing business intelligence...');
      const insight = await generateInsights({ 
        orderCount: orders.length, 
        pendingOrders: orders.filter(o => o.items.some(i => i.status === DeliveryStatus.PENDING)).length,
        userRole: currentUser?.role 
      });
      setAiInsights(insight || "No specific insights today.");
    };
    fetchAI();
  }, [orders, currentUser, refreshKey]);

  // Metric Calculations
  const filteredOrders = isSupplierRole
    ? orders.filter(o => o.items.some(i => {
        const product = products.find(p => p.id === i.productId);
        return product?.primaryVendorId === mySupplierId || product?.secondaryVendorId === mySupplierId;
      }))
    : orders;

  const pendingOrdersCount = filteredOrders.filter(o => 
    o.items.some(i => i.status === DeliveryStatus.PENDING)
  ).length;

  const totalSales = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Chart Data: Sales per Vendor
  const salesByVendor = vendors.map(s => {
    const vendorSales = orders.reduce((sum, o) => {
      const orderAmountForVendor = o.items.reduce((itemSum, item) => {
        const prod = products.find(p => p.id === item.productId);
        if (prod?.primaryVendorId === s.id) {
          return itemSum + (item.quantity * (prod.primaryPrice || 0));
        }
        return itemSum;
      }, 0);
      return sum + orderAmountForVendor;
    }, 0);
    return { name: s.name, sales: vendorSales };
  }).filter(item => item.sales > 0);

  // Pending Orders per Vendor
  const pendingByVendor = vendors.map(s => {
    const count = orders.filter(o => 
      o.items.some(item => {
        const prod = products.find(p => p.id === item.productId);
        return prod?.primaryVendorId === s.id && item.status === DeliveryStatus.PENDING;
      })
    ).length;
    return { name: s.name, count };
  }).filter(item => item.count > 0);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Vendor Wise Pending Orders (detailed)
  const vendorPendingOrders = vendors.map(v => {
    const pendingOrders = filteredOrders
      .filter(o => o.items.some(item => {
        const prod = products.find(p => p.id === item.productId);
        return (prod?.primaryVendorId === v.id || o.vendorId === v.id) && item.status === DeliveryStatus.PENDING;
      }))
      .map(o => ({
        ...o,
        pendingItems: o.items.filter(item => {
          const prod = products.find(p => p.id === item.productId);
          return (prod?.primaryVendorId === v.id || o.vendorId === v.id) && item.status === DeliveryStatus.PENDING;
        })
      }));
    const totalPendingAmount = pendingOrders.reduce((sum, o) =>
      sum + o.pendingItems.reduce((s, item) => s + item.quantity * item.unitPrice, 0), 0
    );
    return { vendor: v, orders: pendingOrders, totalPendingAmount };
  }).filter(v => v.orders.length > 0);

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome, {currentUser?.name}</p>
        </div>
        <div className="flex gap-2">
           <button
             onClick={() => navigate('/products')}
             className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm text-sm"
           >
            <Icons.Filter />
            <span>Catalog</span>
          </button>
           <button
             onClick={() => navigate('/orders')}
             className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 rounded-xl font-medium text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 text-sm"
           >
            <Icons.Plus />
            <span>New Order</span>
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl"><Icons.Orders /></div>
            <div>
              <p className="text-[10px] md:text-sm font-medium text-slate-500">Orders</p>
              <h3 className="text-lg md:text-2xl font-bold text-slate-900">{filteredOrders.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-orange-50 text-orange-600 rounded-lg md:rounded-xl"><Icons.Delivery /></div>
            <div>
              <p className="text-[10px] md:text-sm font-medium text-slate-500">Pending</p>
              <h3 className="text-lg md:text-2xl font-bold text-slate-900">{pendingOrdersCount}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-lg md:rounded-xl">
              <span className="font-bold text-base md:text-lg">₨</span>
            </div>
            <div>
              <p className="text-[10px] md:text-sm font-medium text-slate-500">Revenue</p>
              <h3 className="text-sm md:text-2xl font-bold text-slate-900">{totalSales.toLocaleString()}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-purple-50 text-purple-600 rounded-lg md:rounded-xl"><Icons.Products /></div>
            <div>
              <p className="text-[10px] md:text-sm font-medium text-slate-500">Products</p>
              <h3 className="text-lg md:text-2xl font-bold text-slate-900">{products.length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 md:mb-8">
            <h2 className="text-base md:text-xl font-bold text-slate-900">Revenue by Vendor</h2>
          </div>
          <div className="h-48 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByVendor}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="sales" radius={[6, 6, 0, 0]} barSize={40}>
                   {salesByVendor.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Stats */}
        <div className="space-y-4 md:space-y-8">
          {/* AI Insights Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-4 md:p-8 rounded-2xl md:rounded-3xl text-white shadow-xl shadow-indigo-200">
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-bold text-lg">Smart Insights</h3>
            </div>
            <div className="text-indigo-100 text-sm leading-relaxed whitespace-pre-line min-h-[100px]">
              {aiInsights}
            </div>
            <button 
              onClick={() => setRefreshKey(k => k + 1)}
              className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-bold transition-colors backdrop-blur-md"
            >
              Refresh Analysis
            </button>
          </div>

          {/* Mini Chart */}
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
             <h2 className="text-base md:text-lg font-bold text-slate-900 mb-4 md:mb-6">Pending by Vendor</h2>
             <div className="space-y-3 md:space-y-4">
                {pendingByVendor.length > 0 ? pendingByVendor.map((v, i) => (
                  <div key={v.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                      <span className="text-sm font-medium text-slate-600">{v.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{v.count} orders</span>
                  </div>
                )) : <p className="text-sm text-slate-500 text-center py-4">No pending orders!</p>}
             </div>
          </div>
        </div>
      </div>

      {/* Vendor Wise Pending Orders Section */}
      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-2 md:p-3 bg-orange-50 text-orange-600 rounded-lg md:rounded-xl">
              <Icons.Delivery />
            </div>
            <div>
              <h2 className="text-base md:text-xl font-bold text-slate-900">Vendor Wise Pending Orders</h2>
              <p className="text-[10px] md:text-sm text-slate-500">{vendorPendingOrders.reduce((s, v) => s + v.orders.length, 0)} orders across {vendorPendingOrders.length} vendors</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="text-xs md:text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            View All Orders &rarr;
          </button>
        </div>

        {vendorPendingOrders.length > 0 ? (
          <div className="space-y-4 md:space-y-6">
            {vendorPendingOrders.map((vpo, vi) => (
              <div key={vpo.vendor.id} className="border border-slate-200 rounded-xl md:rounded-2xl overflow-hidden">
                {/* Vendor Header */}
                <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center text-white font-bold text-sm md:text-base"
                      style={{ backgroundColor: COLORS[vi % COLORS.length] }}
                    >
                      {vpo.vendor.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-slate-900">{vpo.vendor.name}</h3>
                      <p className="text-[10px] md:text-xs text-slate-500">{vpo.orders.length} pending order{vpo.orders.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] md:text-xs text-slate-500">Pending Amount</p>
                    <p className="text-sm md:text-lg font-bold text-orange-600">&#8360; {vpo.totalPendingAmount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Orders Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 md:px-6 py-2.5 text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider">Order #</th>
                        <th className="px-4 md:px-6 py-2.5 text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                        <th className="px-4 md:px-6 py-2.5 text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                        <th className="px-4 md:px-6 py-2.5 text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Products</th>
                        <th className="px-4 md:px-6 py-2.5 text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vpo.orders.map((order) => (
                        <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 md:px-6 py-3">
                            <span className="text-xs md:text-sm font-semibold text-indigo-600">{order.orderNumber}</span>
                            {order.poNumber && <p className="text-[10px] text-slate-400 mt-0.5">PO: {order.poNumber}</p>}
                          </td>
                          <td className="px-4 md:px-6 py-3 text-xs md:text-sm text-slate-600 hidden sm:table-cell">{new Date(order.date).toLocaleDateString()}</td>
                          <td className="px-4 md:px-6 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-[10px] md:text-xs font-medium">
                              {order.pendingItems.length} pending
                            </span>
                          </td>
                          <td className="px-4 md:px-6 py-3 hidden md:table-cell">
                            <div className="space-y-1">
                              {order.pendingItems.map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                return (
                                  <div key={idx} className="text-xs text-slate-600">
                                    <span className="font-medium">{prod?.title || 'Unknown'}</span>
                                    <span className="text-slate-400 ml-1">x{item.quantity}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 md:px-6 py-3 text-right">
                            <span className="text-xs md:text-sm font-bold text-slate-900">
                              &#8360; {order.pendingItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl inline-block mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">All Clear!</h3>
            <p className="text-sm text-slate-500">No pending orders across any vendor.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
