import { Vendor, Product, Order, Delivery, Payment, User, Buyer, Category, MeasuringUnit, ChallanStatus } from '../types';

// ---- Vendor ----
export const vendorFromDb = (row: any): Vendor => ({
  id: row.id,
  name: row.name,
  primaryContactName: row.primary_contact_name,
  primaryMobile: row.primary_mobile,
  openingBalance: Number(row.opening_balance) || 0,
  bankAccounts: row.bank_accounts || [],
  contact: row.contact || { phone: '', email: '', address: '' },
});

export const vendorToDb = (v: Vendor) => ({
  id: v.id,
  name: v.name,
  primary_contact_name: v.primaryContactName,
  primary_mobile: v.primaryMobile,
  opening_balance: v.openingBalance || 0,
  bank_accounts: v.bankAccounts,
  contact: v.contact,
});

// ---- Product ----
export const productFromDb = (row: any): Product => ({
  id: row.id,
  title: row.title,
  brand: row.brand,
  category: row.category,
  itemName: row.item_name,
  description: row.description,
  unitSize: row.unit_size,
  packing: row.packing,
  primaryVendorId: row.primary_vendor_id || '',
  primaryPrice: Number(row.primary_price),
  secondaryVendorId: row.secondary_vendor_id || '',
  secondaryPrice: Number(row.secondary_price),
  priceHistory: row.price_history || {},
  measuringUnit: row.measuring_unit || '',
  dateAdded: row.date_added,
  relatedProductIds: (() => {
    const v = row.related_product_id;
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch { return [v]; }
  })(),
});

export const productToDb = (p: Product) => ({
  id: p.id,
  title: p.title,
  brand: p.brand,
  category: p.category,
  item_name: p.itemName,
  description: p.description,
  unit_size: p.unitSize,
  packing: p.packing,
  primary_vendor_id: p.primaryVendorId || null,
  primary_price: p.primaryPrice,
  secondary_vendor_id: p.secondaryVendorId || null,
  secondary_price: p.secondaryPrice,
  price_history: p.priceHistory,
  measuring_unit: p.measuringUnit || null,
  date_added: p.dateAdded,
  related_product_id: p.relatedProductIds && p.relatedProductIds.length > 0 ? JSON.stringify(p.relatedProductIds) : null,
});

// ---- Order ----
export const orderFromDb = (row: any): Order => ({
  id: row.id,
  orderNumber: row.order_number,
  poNumber: row.po_number,
  vendorId: row.vendor_id,
  date: row.date,
  placedBy: row.placed_by,
  buyerId: row.buyer_id,
  confirmedBy: row.confirmed_by,
  items: row.items || [],
  totalAmount: Number(row.total_amount),
});

export const orderToDb = (o: Order) => ({
  id: o.id,
  order_number: o.orderNumber,
  po_number: o.poNumber && o.poNumber.trim() !== '' ? o.poNumber : null,
  vendor_id: o.vendorId || null,
  date: o.date,
  placed_by: o.placedBy,
  buyer_id: o.buyerId || null,
  confirmed_by: o.confirmedBy,
  items: o.items,
  total_amount: o.totalAmount,
});

// ---- Delivery ----
export const deliveryFromDb = (row: any): Delivery => ({
  id: row.id,
  challanNumber: row.challan_number,
  deliveryDate: row.delivery_date,
  challanStatus: row.challan_status || ChallanStatus.ACTIVE,
  statusDescription: row.status_description || undefined,
  items: row.items || [],
});

export const deliveryToDb = (d: Delivery) => ({
  id: d.id,
  challan_number: d.challanNumber,
  delivery_date: d.deliveryDate,
  challan_status: d.challanStatus || ChallanStatus.ACTIVE,
  status_description: d.statusDescription || null,
  items: d.items,
});

// ---- Payment ----
export const paymentFromDb = (row: any): Payment => ({
  id: row.id,
  vendorId: row.vendor_id,
  amount: Number(row.amount),
  date: row.date,
  method: row.method || undefined,
  bankAccount: row.bank_account || undefined,
  invoiceNumber: row.invoice_number || undefined,
  reference: row.reference,
  note: row.note,
});

export const paymentToDb = (p: Payment) => ({
  id: p.id,
  vendor_id: p.vendorId,
  amount: p.amount,
  date: p.date,
  method: p.method || null,
  bank_account: p.bankAccount || null,
  invoice_number: p.invoiceNumber || null,
  reference: p.reference || null,
  note: p.note || null,
});

// ---- User ----
export const userFromDb = (row: any): User => ({
  id: row.id,
  name: row.name,
  mobile: row.mobile,
  password: row.password,
  role: row.role,
  vendorId: row.vendor_id,
  isActive: row.is_active !== false, // default true if null
  allowedVendorIds: (() => {
    const v = row.allowed_vendor_ids;
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  })(),
  mustResetPassword: row.must_reset_password ?? false,
});

export const userToDb = (u: User) => ({
  id: u.id,
  name: u.name,
  mobile: u.mobile,
  password: u.password,
  role: u.role,
  vendor_id: u.vendorId || null,
  is_active: u.isActive !== false,
  allowed_vendor_ids: u.allowedVendorIds && u.allowedVendorIds.length > 0 ? JSON.stringify(u.allowedVendorIds) : null,
  must_reset_password: u.mustResetPassword ?? false,
});

// ---- Buyer ----
export const buyerFromDb = (row: any): Buyer => ({
  id: row.id,
  name: row.name,
  contactNumber: row.contact_number,
});

export const buyerToDb = (b: Buyer) => ({
  id: b.id,
  name: b.name,
  contact_number: b.contactNumber,
});

// ---- Category ----
export const categoryFromDb = (row: any): Category => ({
  id: row.id,
  name: row.name,
  description: row.description,
});

export const categoryToDb = (c: Category) => ({
  id: c.id,
  name: c.name,
  description: c.description || null,
});

// ---- MeasuringUnit ----
export const measuringUnitFromDb = (row: any): MeasuringUnit => ({
  id: row.id,
  name: row.name,
  symbol: row.symbol,
});

export const measuringUnitToDb = (u: MeasuringUnit) => ({
  id: u.id,
  name: u.name,
  symbol: u.symbol,
});
