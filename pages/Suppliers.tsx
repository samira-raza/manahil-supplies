
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CRMContext, generateId } from '../App';
import { UserRole, Vendor, BankAccount, ChallanStatus } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const Vendors: React.FC = () => {
  const ctx = useContext(CRMContext);
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    primaryContactName: '',
    primaryMobile: '',
    email: '',
    address: '',
    openingBalance: '',
    bankAccounts: [
      { bankTitle: '', accountTitle: '', branchName: '', accountNumber: '', ifsc: '' }
    ] as BankAccount[]
  });

  if (!ctx) return null;
  const { vendors, setVendors, currentUser, products, deliveries, payments } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;
  const isVendorStaff = currentUser?.role === UserRole.VENDOR_STAFF;
  const canAddVendors = isSuperAdmin || isAdmin;
  const myVendorId = currentUser?.vendorId;

  const visibleVendors = (isVendor || isVendorStaff)
    ? vendors.filter(s => s.id === myVendorId)
    : vendors;

  // Calculate net payable for a vendor
  const getNetPayable = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    const openingBalance = vendor?.openingBalance || 0;

    const activeStatuses = [ChallanStatus.ACTIVE, ChallanStatus.PARTIAL_RETURNED];
    const totalDeliveredValue = deliveries
      .filter(d => activeStatuses.includes(d.challanStatus || ChallanStatus.ACTIVE))
      .reduce((sum, d) => {
        const dValue = d.items.reduce((iSum, item) => {
          if ((item.itemStatus || ChallanStatus.ACTIVE) !== ChallanStatus.ACTIVE) return iSum;
          const prod = products.find(p => p.id === item.productId);
          if (prod?.primaryVendorId === vendorId) {
            return iSum + (item.quantity * (prod.primaryPrice || 0));
          }
          return iSum;
        }, 0);
        return sum + dValue;
      }, 0);

    const vendorPayments = payments.filter(p => p.vendorId === vendorId);
    const totalPaid = vendorPayments.filter(p => p.method !== 'adjustment').reduce((sum, p) => sum + p.amount, 0);
    const totalAdjustments = vendorPayments.filter(p => p.method === 'adjustment').reduce((sum, p) => sum + p.amount, 0);

    return openingBalance + totalDeliveredValue - totalPaid - totalAdjustments;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBankChange = (index: number, field: keyof BankAccount, value: string) => {
    const updatedBanks = [...formData.bankAccounts];
    updatedBanks[index] = { ...updatedBanks[index], [field]: value };
    setFormData(prev => ({ ...prev, bankAccounts: updatedBanks }));
  };

  const addBankField = () => {
    setFormData(prev => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, { bankTitle: '', accountTitle: '', branchName: '', accountNumber: '', ifsc: '' }]
    }));
  };

  const removeBankField = (index: number) => {
    if (formData.bankAccounts.length === 1) return;
    const updatedBanks = formData.bankAccounts.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, bankAccounts: updatedBanks }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newVendor: Vendor = {
      id: 's_' + generateId(),
      name: formData.name,
      primaryContactName: formData.primaryContactName,
      primaryMobile: formData.primaryMobile,
      openingBalance: formData.openingBalance ? parseFloat(formData.openingBalance) : 0,
      bankAccounts: formData.bankAccounts.filter(b => b.accountNumber && b.bankTitle),
      contact: { phone: formData.primaryMobile, email: formData.email, address: formData.address }
    };
    const { error } = await db.upsertVendor(newVendor);
    if (error) {
      alert('Failed to save vendor: ' + error.message);
      return;
    }
    setVendors(prev => [...prev, newVendor]);
    setShowAddModal(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '', primaryContactName: '', primaryMobile: '', email: '', address: '', openingBalance: '',
      bankAccounts: [{ bankTitle: '', accountTitle: '', branchName: '', accountNumber: '', ifsc: '' }]
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{canAddVendors ? 'Vendors' : 'My Vendor'}</h1>
          <p className="text-sm text-slate-500 mt-1">{visibleVendors.length} vendors</p>
        </div>
        {canAddVendors && (
          <button onClick={() => setShowAddModal(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto">
            <Icons.Plus /> Add Vendor
          </button>
        )}
      </div>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {visibleVendors.map(s => {
          const netPayable = getNetPayable(s.id);
          return (
            <div
              key={s.id}
              onClick={() => navigate(`/suppliers/${s.id}`)}
              className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50 transition-all group active:scale-[0.98]"
            >
              <div className="p-5 md:p-6">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 text-white rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-2xl font-black shadow-lg shrink-0 group-hover:bg-indigo-600 transition-colors">
                    {s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base md:text-lg font-black text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{s.name}</h3>
                    <p className="text-[10px] md:text-xs text-slate-400 font-bold truncate">{s.primaryContactName}</p>
                  </div>
                  <span className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0">
                    <Icons.ChevronDown />
                  </span>
                </div>
              </div>
              <div className={`px-5 md:px-6 py-3 md:py-4 border-t ${netPayable > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider ${netPayable > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {netPayable > 0 ? 'Pending Balance' : 'Balance Clear'}
                  </span>
                  <span className={`text-sm md:text-lg font-black ${netPayable > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    PKR {Math.abs(netPayable).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visibleVendors.length === 0 && (
        <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <Icons.Vendors />
          <div className="mt-4 text-sm font-bold">No vendors found</div>
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
             <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-lg md:text-2xl font-black text-slate-900">Add Vendor</h2>
                  <p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">New supplier registration</p>
                </div>
                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-2 md:p-3 hover:bg-slate-200 rounded-xl md:rounded-2xl transition-colors">
                  <svg className="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>
             <form onSubmit={handleSubmit} className="p-4 md:p-10 space-y-6 md:space-y-8 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                   <div className="group md:col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Company Name*</label>
                      <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="Vendor company name" required />
                   </div>
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Contact Person*</label>
                      <input type="text" name="primaryContactName" value={formData.primaryContactName} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="Primary contact name" required />
                   </div>
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Mobile*</label>
                      <input type="tel" name="primaryMobile" value={formData.primaryMobile} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="Mobile number" required />
                   </div>
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Email</label>
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="Email address" />
                   </div>
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Address</label>
                      <input type="text" name="address" value={formData.address} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="Business address" />
                   </div>
                   {isSuperAdmin && (
                   <div className="group">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-focus-within:text-indigo-600">Opening Balance (PKR)</label>
                      <input type="number" step="0.01" name="openingBalance" value={formData.openingBalance} onChange={handleInputChange} className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-sm shadow-inner" placeholder="0.00" />
                   </div>
                   )}
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                   <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Accounts</h3>
                      <button type="button" onClick={addBankField} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">+ Add Bank</button>
                   </div>
                   {formData.bankAccounts.map((bank, idx) => (
                      <div key={idx} className="p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-[24px] border border-slate-100 space-y-3 md:space-y-4">
                         <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Bank #{idx + 1}</span>
                            {formData.bankAccounts.length > 1 && (
                              <button type="button" onClick={() => removeBankField(idx)} className="text-[10px] font-black text-red-500 uppercase hover:text-red-700 transition-colors">Remove</button>
                            )}
                         </div>
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
                   <button type="button" onClick={() => { setShowAddModal(false); resetForm(); }} className="px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Discard</button>
                   <button type="submit" className="px-8 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-200 transition-all active:scale-[0.98]">Save Vendor</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
