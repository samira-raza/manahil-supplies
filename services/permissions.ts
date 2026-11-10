import { User, UserRole } from '../types';

// Product rules agreed on 4 Nov 2026. The "admin-like" user type does not exist yet,
// so its rights come from the two tick-boxes the Super Admin can give to an Admin.
const isSuperAdmin = (u?: User | null) => u?.role === UserRole.SUPER_ADMIN;
const isAdmin = (u?: User | null) => u?.role === UserRole.ADMIN;

export const productPermissions = (u?: User | null) => ({
  createProducts: isSuperAdmin(u) || (isAdmin(u) && !!u?.canCreateProducts),
  editProductInfo: isSuperAdmin(u),
  addPrices: isSuperAdmin(u) || isAdmin(u),
  correctPrices: isSuperAdmin(u),
  addSuppliers: isSuperAdmin(u) || (isAdmin(u) && !!u?.canAddProductSuppliers),
  manageSuppliers: isSuperAdmin(u),
  // Agreed 4 Nov 2026: only the Super Admin archives, restores and deletes products
  archiveProducts: isSuperAdmin(u),
  deleteProducts: isSuperAdmin(u),
});
