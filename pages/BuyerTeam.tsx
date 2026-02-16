
import React, { useContext, useState } from 'react';
import { CRMContext, generateId } from '../App';
import { Buyer, UserRole } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const BuyerTeam: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');

  if (!ctx) return null;
  const { buyers, setBuyers, currentUser } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const canManageBuyers = isSuperAdmin || isAdmin;

  const handleAddBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !contact) return;

    const newBuyer: Buyer = {
      id: generateId(),
      name,
      contactNumber: contact
    };

    await db.upsertBuyer(newBuyer);
    setBuyers([...buyers, newBuyer]);
    setName('');
    setContact('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Buyers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage procurement officers and order placement personnel</p>
        </div>
        {canManageBuyers && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            Add Buyer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {buyers.map(buyer => (
          <div key={buyer.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all flex flex-col justify-between">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl border-2 border-indigo-100">
                {buyer.name[0]}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{buyer.name}</h3>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                   <Icons.User />
                   <span className="font-medium">Procurement Officer</span>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</span>
                  <span className="text-sm font-bold text-slate-700">{buyer.contactNumber}</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Orders</span>
                  <span className="text-sm font-black text-indigo-600">Calculated on load</span>
               </div>
            </div>

            <div className="mt-6 flex gap-2">
               <button className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors">View Profile</button>
               {canManageBuyers && (
                 <button
                   onClick={async () => { await db.deleteBuyer(buyer.id); setBuyers(buyers.filter(b => b.id !== buyer.id)); }}
                   className="p-2 bg-rose-50 text-rose-400 rounded-xl hover:bg-rose-100 hover:text-rose-600 transition-colors"
                 >
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg>
                 </button>
               )}
            </div>
          </div>
        ))}
        {buyers.length === 0 && (
           <div className="col-span-full py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[40px] flex flex-col items-center justify-center">
              <div className="text-slate-300 mb-4"><Icons.User /></div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No buyers registered in the team</p>
           </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
             <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                   <h2 className="text-lg md:text-2xl font-black text-slate-900">Add Buyer</h2>
                   <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Register order placement personnel</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2}/></svg></button>
             </div>
             <form onSubmit={handleAddBuyer} className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name*</label>
                   <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm"
                    placeholder="e.g. Amish Sharma"
                    required
                   />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Number*</label>
                   <input
                    type="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-sm"
                    placeholder="e.g. 98123 45678"
                    required
                   />
                </div>
                <button type="submit" className="w-full py-4 md:py-5 bg-indigo-600 text-white rounded-xl md:rounded-[24px] font-black text-base md:text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98]">
                   Add to Team
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerTeam;
