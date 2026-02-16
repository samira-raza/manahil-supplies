
import React, { useContext, useState } from 'react';
import { CRMContext } from '../App';
import { UserRole, User } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) password += chars[Math.floor(Math.random() * chars.length)];
  return password;
};

const UserManagement: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserMobile, setNewUserMobile] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole | ''>('');
  const [newUserVendorId, setNewUserVendorId] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; mobile: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!ctx) return null;
  const { users, setUsers, currentUser, vendors } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isVendor = currentUser?.role === UserRole.VENDOR;

  // Who can create accounts
  const canManage = isSuperAdmin || isAdmin || isVendor;

  // Available roles based on current user's role
  const getAvailableRoles = (): { value: UserRole; label: string }[] => {
    if (isSuperAdmin) {
      return [
        { value: UserRole.ADMIN, label: 'Admin' },
        { value: UserRole.VENDOR, label: 'Vendor' },
        { value: UserRole.VENDOR_STAFF, label: 'Vendor Staff' }
      ];
    }
    if (isAdmin) {
      return [
        { value: UserRole.VENDOR, label: 'Vendor' },
        { value: UserRole.VENDOR_STAFF, label: 'Vendor Staff' }
      ];
    }
    if (isVendor) {
      return [{ value: UserRole.VENDOR_STAFF, label: 'Vendor Staff' }];
    }
    return [];
  };

  // Visible users based on current user's role
  const getVisibleUsers = () => {
    if (isSuperAdmin) {
      return users; // Super admin sees everyone
    }
    if (isAdmin) {
      // Admin sees everyone except super admins
      return users.filter(u => u.role !== UserRole.SUPER_ADMIN);
    }
    if (isVendor || currentUser?.role === UserRole.VENDOR_STAFF) {
      // Vendors and vendor staff see only their own team
      return users.filter(u => u.vendorId === currentUser?.vendorId);
    }
    return [];
  };

  const visibleUsers = getVisibleUsers();
  const availableRoles = getAvailableRoles();

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN: return 'bg-purple-100 text-purple-700';
      case UserRole.ADMIN: return 'bg-blue-100 text-blue-700';
      case UserRole.VENDOR: return 'bg-emerald-100 text-emerald-700';
      case UserRole.VENDOR_STAFF: return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const formatRoleName = (role: UserRole) => {
    return role.replace(/_/g, ' ');
  };

  const handleAddUser = async () => {
    const effectiveRole = isVendor ? UserRole.VENDOR_STAFF : newUserRole;
    if (!newUserName || !newUserMobile || !effectiveRole) return;

    // Validate supplier selection for vendor roles
    if ((effectiveRole === UserRole.VENDOR || effectiveRole === UserRole.VENDOR_STAFF) && !isVendor && !newUserVendorId) {
      alert('Please select a vendor for this account');
      return;
    }

    const tempPassword = generatePassword();

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUserName,
      mobile: newUserMobile,
      password: tempPassword,
      role: effectiveRole,
      vendorId: isVendor ? currentUser?.vendorId : newUserVendorId || undefined,
      mustResetPassword: true
    };

    await db.upsertUser(newUser);
    setUsers([...users, newUser]);

    // Show credentials modal
    setCreatedCredentials({ name: newUserName, mobile: newUserMobile, password: tempPassword });

    // Reset form
    setNewUserName('');
    setNewUserMobile('');
    setNewUserRole('');
    setNewUserVendorId('');
    setShowAddModal(false);
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `Login ID: ${createdCredentials.mobile}\nTemporary Password: ${createdCredentials.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if user needs supplier selection in modal
  const needsVendorSelection = (role: UserRole | '') => {
    if (!role) return false;
    if (isVendor) return false; // Vendor creating staff - auto-assign to their own vendor
    return role === UserRole.VENDOR || role === UserRole.VENDOR_STAFF;
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Team Access</h1>
          <p className="text-sm text-slate-500 mt-1">Manage user accounts and access permissions</p>
        </div>
        {canManage && availableRoles.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            {isVendor ? 'Add Staff' : 'Create Account'}
          </button>
        )}
      </div>

      {/* Role Legend */}
      <div className="flex flex-wrap gap-2">
        {isSuperAdmin && <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeColor(UserRole.SUPER_ADMIN)}`}>Super Admin</span>}
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeColor(UserRole.ADMIN)}`}>Admin</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeColor(UserRole.VENDOR)}`}>Vendor</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeColor(UserRole.VENDOR_STAFF)}`}>Vendor Staff</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleUsers.map(user => {
          const userVendor = vendors.find(s => s.id === user.vendorId);
          return (
            <div key={user.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 border-2 border-transparent group-hover:border-indigo-100 transition-all">
                  {user.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{user.name}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleBadgeColor(user.role)}`}>
                    {formatRoleName(user.role)}
                  </span>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Mobile</span>
                  <span className="font-medium">{user.mobile}</span>
                </div>
                {userVendor && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Vendor</span>
                    <span className="font-medium truncate max-w-[150px]">{userVendor.name}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className="text-emerald-500 font-bold">● Active</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors">View Details</button>
                {(isSuperAdmin || (isAdmin && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN)) && (
                  <button className="px-3 py-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 rounded-lg text-xs transition-colors"><Icons.Logout /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {visibleUsers.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg font-medium">No users to display</p>
          <p className="text-sm">Create accounts using the button above</p>
        </div>
      )}

      {/* Create Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl md:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4 md:my-8 max-h-[95vh] flex flex-col">
             <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <h2 className="text-lg md:text-xl font-bold">{isVendor ? 'Add Staff Member' : 'Create New Account'}</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2} /></svg></button>
             </div>
             <div className="p-4 md:p-8 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mobile Number (Login ID)</label>
                  <input
                    type="tel"
                    value={newUserMobile}
                    onChange={(e) => setNewUserMobile(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 9876543210"
                  />
                </div>

                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-indigo-700 text-xs leading-relaxed">
                  <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  A temporary password will be auto-generated. The user will be asked to set a new password on first login.
                </div>

                {!isVendor && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Select a role</option>
                      {availableRoles.map(role => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsVendorSelection(newUserRole) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Assign to Vendor</label>
                    <select
                      value={newUserVendorId}
                      onChange={(e) => setNewUserVendorId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Select a vendor</option>
                      {vendors.map(supplier => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-xs leading-relaxed">
                   <strong>Permissions:</strong>
                   {isSuperAdmin && newUserRole === UserRole.ADMIN && (
                     <span> Admin has full access except payment editing (read-only).</span>
                   )}
                   {(isSuperAdmin || isAdmin) && newUserRole === UserRole.VENDOR && (
                     <span> Vendor can view their own products, orders, deliveries (read-only) and create staff accounts.</span>
                   )}
                   {(isVendor || newUserRole === UserRole.VENDOR_STAFF) && (
                     <span> Staff can view products, orders and deliveries for their vendor (read-only).</span>
                   )}
                   {!newUserRole && !isVendor && <span> Select a role to see permissions.</span>}
                </div>

                <button
                  onClick={handleAddUser}
                  disabled={!newUserName || !newUserMobile || (!isVendor && !newUserRole)}
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Account
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Credentials Modal - shown after account creation */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 md:p-6 border-b border-slate-100 bg-emerald-50 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-emerald-900">Account Created</h2>
                <p className="text-xs text-emerald-600">Share these credentials with {createdCredentials.name}</p>
              </div>
            </div>
            <div className="p-8 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Name</span>
                  <span className="font-bold text-slate-900">{createdCredentials.name}</span>
                </div>
                <div className="border-t border-slate-200"></div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Login ID</span>
                  <span className="font-bold text-slate-900 font-mono">{createdCredentials.mobile}</span>
                </div>
                <div className="border-t border-slate-200"></div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Temp Password</span>
                  <span className="font-bold text-slate-900 font-mono tracking-wider">{createdCredentials.password}</span>
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-700 text-xs leading-relaxed">
                <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                The user will be asked to set a new password on their first login. This temporary password will expire after first use.
              </div>

              <button
                onClick={handleCopyCredentials}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    Copy Credentials
                  </>
                )}
              </button>

              <button
                onClick={() => { setCreatedCredentials(null); setCopied(false); }}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
