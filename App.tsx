
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Category, ChallanStatus, DeliveryStatus, UserRole, Product, Vendor, Order, Delivery, User, Payment, Buyer, StagedDispatchItem, MeasuringUnit } from './types';
import { Icons } from './constants';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Vendors from './pages/Suppliers';
import VendorDetail from './pages/VendorDetail';
import Orders from './pages/Orders';
import Deliveries from './pages/Deliveries';
import UserManagement from './pages/UserManagement';
import Categories from './pages/Categories';
import MeasuringUnits from './pages/MeasuringUnits';
import BuyerTeam from './pages/BuyerTeam';
import { supabase } from './services/supabase';
import {
  vendorFromDb, productFromDb, orderFromDb, deliveryFromDb,
  paymentFromDb, userFromDb, buyerFromDb, categoryFromDb, measuringUnitFromDb,
  deliveryToDb, orderToDb, userToDb
} from './services/mappers';

export const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

// One-time cleanup of old localStorage data (now using Supabase)
const OLD_KEYS = [
  'packtrack_user', 'packtrack_products', 'packtrack_vendors',
  'packtrack_categories', 'packtrack_orders', 'packtrack_deliveries',
  'packtrack_users', 'packtrack_payments', 'packtrack_buyers'
];
OLD_KEYS.forEach(key => localStorage.removeItem(key));

const useCRMStore = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [measuringUnits, setMeasuringUnits] = useState<MeasuringUnit[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [dispatchBucket, setDispatchBucket] = useState<StagedDispatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all data from Supabase on mount
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const [
        { data: usersData },
        { data: vendorsData },
        { data: productsData },
        { data: categoriesData },
        { data: measuringUnitsData },
        { data: ordersData },
        { data: deliveriesData },
        { data: paymentsData },
        { data: buyersData },
      ] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('vendors').select('*'),
        supabase.from('products').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('measuring_units').select('*'),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
        supabase.from('payments').select('*'),
        supabase.from('buyers').select('*'),
      ]);

      setUsers((usersData || []).map(userFromDb));
      setVendors((vendorsData || []).map(vendorFromDb));
      setProducts((productsData || []).map(productFromDb));
      setCategories((categoriesData || []).map(categoryFromDb));
      setMeasuringUnits((measuringUnitsData || []).map(measuringUnitFromDb));
      const parsedOrders = (ordersData || []).map(orderFromDb);
      const parsedDeliveries = (deliveriesData || []).map(deliveryFromDb);
      setDeliveries(parsedDeliveries);
      setPayments((paymentsData || []).map(paymentFromDb));
      setBuyers((buyersData || []).map(buyerFromDb));

      // Recalculate order statuses from delivery data on startup
      const recalculated = parsedOrders.map(order => ({
        ...order,
        items: order.items.map(item => {
          const delItems = parsedDeliveries.flatMap(d =>
            d.items.filter(di => di.orderNumber === order.orderNumber && di.productId === item.productId)
          );
          const activeDelivered = delItems
            .filter(di => !di.itemStatus || di.itemStatus === ChallanStatus.ACTIVE)
            .reduce((sum, di) => sum + di.quantity, 0);
          const hasReturned = delItems.some(di => di.itemStatus === ChallanStatus.RETURNED);

          let newStatus: DeliveryStatus;
          if (activeDelivered >= item.quantity) newStatus = DeliveryStatus.COMPLETE;
          else if (activeDelivered > 0) newStatus = DeliveryStatus.PARTIAL;
          else if (hasReturned) newStatus = DeliveryStatus.RETURN;
          else newStatus = DeliveryStatus.PENDING;

          return { ...item, status: newStatus };
        })
      }));
      setOrders(recalculated);

      // Persist any corrected orders to Supabase
      for (const o of recalculated) {
        const orig = parsedOrders.find(oo => oo.id === o.id);
        if (orig && JSON.stringify(orig.items) !== JSON.stringify(o.items)) {
          await supabase.from('orders').update({ items: o.items }).eq('id', o.id);
        }
      }

      // Restore logged-in user session from localStorage
      const savedUserId = localStorage.getItem('packtrack_current_user_id');
      if (savedUserId && usersData) {
        const found = usersData.find((u: any) => u.id === savedUserId);
        if (found) setCurrentUser(userFromDb(found));
      }

      setLoading(false);
    };
    loadAll();
  }, []);

  // Persist current user session to localStorage
  useEffect(() => {
    if (currentUser) localStorage.setItem('packtrack_current_user_id', currentUser.id);
    else localStorage.removeItem('packtrack_current_user_id');
  }, [currentUser]);

  const recalculateOrderStatuses = async (currentOrders: Order[], currentDeliveries: Delivery[]): Promise<Order[]> => {
    const updated = currentOrders.map(order => ({
      ...order,
      items: order.items.map(item => {
        const delItems = currentDeliveries.flatMap(d =>
          d.items.filter(di => di.orderNumber === order.orderNumber && di.productId === item.productId)
        );
        const activeDelivered = delItems
          .filter(di => !di.itemStatus || di.itemStatus === ChallanStatus.ACTIVE)
          .reduce((sum, di) => sum + di.quantity, 0);
        const hasReturned = delItems.some(di => di.itemStatus === ChallanStatus.RETURNED);

        let newStatus: DeliveryStatus;
        if (activeDelivered >= item.quantity) newStatus = DeliveryStatus.COMPLETE;
        else if (activeDelivered > 0) newStatus = DeliveryStatus.PARTIAL;
        else if (hasReturned) newStatus = DeliveryStatus.RETURN;
        else newStatus = DeliveryStatus.PENDING;

        return { ...item, status: newStatus };
      })
    }));

    for (const o of updated) {
      const orig = currentOrders.find(oo => oo.id === o.id);
      if (orig && JSON.stringify(orig.items) !== JSON.stringify(o.items)) {
        await supabase.from('orders').update({ items: o.items }).eq('id', o.id);
      }
    }
    return updated;
  };

  const finalizeChallan = async (challanNumber: string) => {
    if (dispatchBucket.length === 0 || !challanNumber) return;

    const bucket = [...dispatchBucket];

    const newDelivery: Delivery = {
      id: generateId(),
      challanNumber,
      deliveryDate: new Date().toISOString().split('T')[0],
      challanStatus: ChallanStatus.ACTIVE,
      items: bucket.map(({ productTitle, ...rest }) => rest)
    };

    await supabase.from('deliveries').insert(deliveryToDb(newDelivery));

    // Use functional updates to guarantee latest state
    console.log('[finalizeChallan] newDelivery items:', JSON.stringify(newDelivery.items));
    console.log('[finalizeChallan] deliveries count from closure:', deliveries.length);
    setDeliveries(prev => [newDelivery, ...prev]);
    setOrders(prevOrders => {
      const allDeliveries = [newDelivery, ...deliveries];
      console.log('[finalizeChallan] allDeliveries count:', allDeliveries.length);
      console.log('[finalizeChallan] prevOrders count:', prevOrders.length);
      const updated = prevOrders.map(order => ({
        ...order,
        items: order.items.map(item => {
          const delItems = allDeliveries.flatMap(d =>
            d.items.filter(di => di.orderNumber === order.orderNumber && di.productId === item.productId)
          );
          const activeDelivered = delItems
            .filter(di => !di.itemStatus || di.itemStatus === ChallanStatus.ACTIVE)
            .reduce((sum, di) => sum + di.quantity, 0);
          const hasReturned = delItems.some(di => di.itemStatus === ChallanStatus.RETURNED);

          let newStatus: DeliveryStatus;
          if (activeDelivered >= item.quantity) newStatus = DeliveryStatus.COMPLETE;
          else if (activeDelivered > 0) newStatus = DeliveryStatus.PARTIAL;
          else if (hasReturned) newStatus = DeliveryStatus.RETURN;
          else newStatus = DeliveryStatus.PENDING;

          console.log(`[finalizeChallan] Order ${order.orderNumber} | Product ${item.productId} | delItems: ${delItems.length} | activeDelivered: ${activeDelivered} | ordered: ${item.quantity} | old: ${item.status} | new: ${newStatus}`);

          return { ...item, status: newStatus };
        })
      }));

      // Persist changed orders to Supabase
      for (const o of updated) {
        const orig = prevOrders.find(oo => oo.id === o.id);
        if (orig && JSON.stringify(orig.items) !== JSON.stringify(o.items)) {
          console.log(`[finalizeChallan] Persisting order ${o.orderNumber} to Supabase`);
          supabase.from('orders').update({ items: o.items }).eq('id', o.id);
        }
      }

      return updated;
    });
    setDispatchBucket([]);
    alert(`Challan ${challanNumber} generated for ${bucket.length} items.`);
  };

  return {
    currentUser, setCurrentUser, products, setProducts, vendors, setVendors, categories, setCategories,
    measuringUnits, setMeasuringUnits,
    orders, setOrders, deliveries, setDeliveries, users, setUsers, payments, setPayments, buyers, setBuyers,
    dispatchBucket, setDispatchBucket, finalizeChallan, recalculateOrderStatuses, loading
  };
};

export const CRMContext = React.createContext<ReturnType<typeof useCRMStore> | null>(null);

const ChallanBucketUI = () => {
  const ctx = React.useContext(CRMContext);
  const [challanNo, setChallanNo] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  if (!ctx || ctx.dispatchBucket.length === 0) return null;
  const { dispatchBucket, setDispatchBucket, finalizeChallan } = ctx;

  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!challanNo) { alert("Please provide a Challan Number"); return; }
    finalizeChallan(challanNo);
    setChallanNo('');
    setIsFinalizing(false);
  };

  return (
    <>
      <div className="fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-2 md:px-4 animate-in slide-in-from-bottom-10">
        <div className="bg-slate-900 text-white rounded-2xl md:rounded-[32px] shadow-2xl p-3 md:p-6 border border-white/10 flex items-center justify-between gap-3 md:gap-6 backdrop-blur-xl bg-slate-900/90">
          <div className="flex items-center gap-2 md:gap-4">
             <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-lg md:text-xl shadow-lg shadow-indigo-900/40">
                {dispatchBucket.length}
             </div>
             <div>
                <div className="text-xs md:text-sm font-black uppercase tracking-wider md:tracking-widest text-indigo-400">Dispatch Bucket</div>
                <div className="text-[10px] md:text-xs text-slate-400 font-bold hidden sm:block">Staged from multiple orders</div>
             </div>
          </div>

          <div className="flex gap-2 md:gap-3">
            <button onClick={() => setDispatchBucket([])} className="px-3 md:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs text-slate-400 hover:text-white transition-colors">Clear</button>
            <button onClick={() => setIsFinalizing(true)} className="px-4 md:px-8 py-2 md:py-3 bg-indigo-600 rounded-lg md:rounded-xl font-black text-[10px] md:text-xs uppercase tracking-wider md:tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-indigo-500 active:scale-95 transition-all">Challan</button>
          </div>
        </div>
      </div>

      {isFinalizing && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 md:p-4 z-[200] overflow-y-auto">
           <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 my-4 md:my-8 max-h-[95vh] flex flex-col">
              <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                 <div>
                    <h2 className="text-lg md:text-xl font-black text-slate-900">Finalize Dispatch</h2>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">Multi-order Challan Sequence</p>
                 </div>
                 <button onClick={() => setIsFinalizing(false)} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-all"><Icons.Logout /></button>
              </div>
              <form onSubmit={handleIssue} className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto flex-1">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assign Challan Number*</label>
                    <input autoFocus type="text" value={challanNo} onChange={e => setChallanNo(e.target.value)} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-900 shadow-inner" placeholder="e.g. CH-2024-88" required />
                 </div>
                 <div className="max-h-48 overflow-y-auto space-y-2">
                    {dispatchBucket.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                         <div className="text-xs">
                            <div className="font-black text-slate-900">{item.productTitle}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase">{item.orderNumber} • Qty: {item.quantity}</div>
                         </div>
                         <div className="text-[9px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{item.newStatus}</div>
                      </div>
                    ))}
                 </div>
                 <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100">Issue Document</button>
              </form>
           </div>
        </div>
      )}
    </>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ctx = React.useContext(CRMContext);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  if (!ctx) return null;
  const { currentUser, setCurrentUser } = ctx;

  const handleLogout = () => setCurrentUser(null);

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;

  // Define all nav items with role requirements
  const allNavItems = [
    { name: 'Dashboard', path: '/', icon: Icons.Dashboard, roles: ['all'] },
    { name: 'Products', path: '/products', icon: Icons.Products, roles: ['all'] },
    { name: 'Categories', path: '/categories', icon: Icons.Category, roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    { name: 'Units', path: '/measuring-units', icon: Icons.Ruler, roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    { name: 'Vendors', path: '/suppliers', icon: Icons.Vendors, roles: ['all'] },
    { name: 'Buyer Team', path: '/buyers', icon: Icons.User, roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    { name: 'Orders', path: '/orders', icon: Icons.Orders, roles: ['all'] },
    { name: 'Deliveries', path: '/deliveries', icon: Icons.Delivery, roles: ['all'] },
    { name: 'Team Access', path: '/users', icon: Icons.User, roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VENDOR] },
  ];

  // Filter nav items based on user role
  const navItems = allNavItems.filter(item => {
    if (item.roles.includes('all')) return true;
    return item.roles.includes(currentUser?.role as UserRole);
  });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg">MS</div>
          <h1 className="text-lg font-bold">Manahil Supplies</h1>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2.5 hover:bg-slate-700 rounded-xl transition-colors">
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-gradient-to-b from-slate-900 to-slate-800 pt-16">
          <div className="p-4 border-b border-slate-700/50 mx-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-lg font-bold">{currentUser?.name?.[0] || 'U'}</div>
              <div>
                <p className="font-semibold text-white">{currentUser?.name}</p>
                <p className="text-sm text-slate-400">{currentUser?.role}</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-4 px-5 py-4 rounded-xl transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
                >
                  <item.icon /><span className="font-medium text-base">{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700/50">
            <button onClick={handleLogout} className="flex items-center justify-center gap-3 w-full px-4 py-4 bg-slate-700/50 hover:bg-red-600/20 hover:text-red-400 rounded-xl transition-all text-slate-300">
              <Icons.Logout /><span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-72 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex-col hidden md:flex shrink-0">
        <div className="p-6 flex items-center gap-4 border-b border-slate-700/50">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg">MS</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Manahil Supplies</h1>
            <p className="text-xs text-slate-400">Inventory Manager</p>
          </div>
        </div>
        <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}>
                <item.icon /><span className="font-medium text-[15px]">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700/50 mx-3 mb-3">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold">{currentUser?.name?.[0] || 'U'}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{currentUser?.name}</p>
              <p className="text-xs text-slate-400">{currentUser?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-700/50 hover:bg-red-600/20 hover:text-red-400 rounded-xl transition-all text-slate-300">
            <Icons.Logout /><span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative flex flex-col pb-32 pt-14 md:pt-0">
        <div className="p-4 md:p-6 lg:p-10 max-w-7xl mx-auto w-full">{children}</div>
      </main>
      <ChallanBucketUI />
    </div>
  );
};

const ResetPasswordPage: React.FC<{ user: User; onComplete: () => void }> = ({ user, onComplete }) => {
  const ctx = React.useContext(CRMContext);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    const updatedUser: User = { ...user, password: newPassword, mustResetPassword: false };
    await supabase.from('users').update(userToDb(updatedUser)).eq('id', user.id);

    if (ctx) {
      ctx.setUsers(ctx.users.map(u => u.id === user.id ? updatedUser : u));
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-slate-800">Password Updated!</h1>
          <p className="text-slate-500 mb-8">Your password has been changed successfully. Please login with your new password.</p>
          <button onClick={onComplete} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.98]">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4">
      <form onSubmit={handleReset} className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 text-center">
        <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-amber-200">
          <svg className="w-10 h-10 md:w-12 md:h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-slate-800">Set New Password</h1>
        <p className="text-slate-500 mb-8 text-base">Welcome, <strong>{user.name}</strong>! Please set a new password for your account.</p>

        <div className="mb-4">
          <label className="block text-left text-sm font-semibold text-slate-600 mb-2">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white outline-none text-lg font-semibold text-slate-800 transition-all" placeholder="Min. 6 characters" required />
        </div>
        <div className="mb-4">
          <label className="block text-left text-sm font-semibold text-slate-600 mb-2">Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white outline-none text-lg font-semibold text-slate-800 transition-all" placeholder="Re-enter password" required />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium text-left">
            {error}
          </div>
        )}

        <button type="submit" className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.98]">
          Update Password
        </button>
      </form>
    </div>
  );
};

const LoginPage = () => {
  const ctx = React.useContext(CRMContext);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [resetUser, setResetUser] = useState<User | null>(null);
  if (!ctx) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = ctx.users.find(u => u.mobile === mobile && u.password === password);
    if (!user) { alert('Invalid login ID or password'); return; }

    if (user.mustResetPassword) {
      setResetUser(user);
    } else {
      ctx.setCurrentUser(user);
    }
  };

  if (resetUser) {
    return <ResetPasswordPage user={resetUser} onComplete={() => { setResetUser(null); setMobile(''); setPassword(''); }} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4">
      <form onSubmit={handleLogin} className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 text-center">
        <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white text-3xl md:text-4xl font-black mx-auto mb-6 shadow-xl shadow-indigo-200">MS</div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-slate-800">Manahil Supplies</h1>
        <p className="text-slate-500 mb-8 text-base">Enter your credentials to login</p>
        <div className="mb-4">
          <label className="block text-left text-sm font-semibold text-slate-600 mb-2">Mobile Number</label>
          <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white outline-none text-lg font-semibold text-slate-800 transition-all" placeholder="Enter mobile number" required />
        </div>
        <div className="mb-6">
          <label className="block text-left text-sm font-semibold text-slate-600 mb-2">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white outline-none text-lg font-semibold text-slate-800 transition-all" placeholder="Enter password" required />
        </div>
        <button type="submit" className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.98]">
          Login
        </button>
        <p className="mt-6 text-sm text-slate-400">Login ID: samira51214</p>
      </form>
    </div>
  );
};

const App: React.FC = () => {
  const store = useCRMStore();

  if (store.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-4 animate-pulse shadow-xl">MS</div>
          <p className="text-slate-500 font-medium">Loading Manahil Supplies...</p>
        </div>
      </div>
    );
  }

  return (
    <CRMContext.Provider value={store}>
      <HashRouter>
        {!store.currentUser ? <Routes><Route path="*" element={<LoginPage />} /></Routes> : <Layout><Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/measuring-units" element={<MeasuringUnits />} />
          <Route path="/suppliers" element={<Vendors />} />
          <Route path="/suppliers/:id" element={<VendorDetail />} />
          <Route path="/buyers" element={<BuyerTeam />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes></Layout>}
      </HashRouter>
    </CRMContext.Provider>
  );
};

export default App;
