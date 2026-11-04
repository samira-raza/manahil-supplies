import { Vendor, Product, ProductSupplier, ProductPrice, ProductActivity, Order, Delivery, Payment, User, Buyer, Category, MeasuringUnit, ChallanStatus } from '../types';
import { mainSupplier, activeSuppliers, priceOn, sortPrices } from './pricing';

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
// Suppliers come from product_suppliers and product_prices. Products not yet moved over
// fall back to the old primary/secondary columns and price_history.
const legacySuppliers = (row: any): ProductSupplier[] => {
  const history = row.price_history || {};
  const slot = (vendorId: string, price: any, isMain: boolean): ProductSupplier => {
    const records: any[] = Array.isArray(history[vendorId]) ? history[vendorId] : [];
    const prices: ProductPrice[] = records.length > 0
      ? records.map((h, i) => ({
          id: `pp_${row.id}_${vendorId}_${i}`,
          price: Number(h.price) || 0,
          effectiveDate: h.effectiveDate || h.date || row.date_added,
          note: h.note || undefined,
          createdAt: `${h.date || row.date_added}T00:00:${String(i).padStart(2, '0')}`,
        }))
      : [{ id: `pp_${row.id}_${vendorId}_0`, price: Number(price) || 0, effectiveDate: row.date_added, createdAt: `${row.date_added}T00:00:00` }];
    return { id: `ps_${row.id}_${vendorId}`, vendorId, isMain, isActive: true, addedAt: row.date_added, prices };
  };
  const list: ProductSupplier[] = [];
  if (row.primary_vendor_id) list.push(slot(row.primary_vendor_id, row.primary_price, true));
  if (row.secondary_vendor_id && row.secondary_vendor_id !== row.primary_vendor_id) list.push(slot(row.secondary_vendor_id, row.secondary_price, false));
  return list;
};

export const productSupplierFromDb = (row: any, priceRows: any[]): ProductSupplier => ({
  id: row.id,
  vendorId: row.vendor_id,
  isMain: !!row.is_main,
  isActive: row.is_active !== false,
  addedBy: row.added_by || undefined,
  addedAt: row.added_at,
  prices: priceRows
    .filter(pr => pr.product_id === row.product_id && pr.vendor_id === row.vendor_id)
    .map(productPriceFromDb),
});

export const productPriceFromDb = (row: any): ProductPrice => ({
  id: row.id,
  price: Number(row.price) || 0,
  effectiveDate: row.effective_date,
  note: row.note || undefined,
  createdBy: row.created_by || undefined,
  createdAt: row.created_at,
});

export const productActivityFromDb = (row: any): ProductActivity => ({
  id: row.id,
  productId: row.product_id,
  type: row.type,
  details: row.details || '',
  userId: row.user_id || undefined,
  userName: row.user_name || undefined,
  at: row.at,
});

export const productFromDb = (row: any, supplierRows: any[] = [], priceRows: any[] = [], activityRows: any[] = []): Product => {
  const own = supplierRows.filter(s => s.product_id === row.id);
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    category: row.category,
    itemName: row.item_name,
    description: row.description,
    unitSize: row.unit_size,
    packing: row.packing,
    suppliers: own.length > 0 ? own.map(s => productSupplierFromDb(s, priceRows)) : legacySuppliers(row),
    activity: activityRows
      .filter(a => a.product_id === row.id)
      .map(productActivityFromDb)
      .sort((a, b) => b.at.localeCompare(a.at)),
    measuringUnit: row.measuring_unit || '',
    dateAdded: row.date_added,
    relatedProductIds: (() => {
      const v = row.related_product_id;
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch { return [v]; }
    })(),
  };
};

// The old primary/secondary columns are still written (main supplier, then the next active one)
// so older screens and a rollback keep working.
export const productToDb = (p: Product) => {
  const main = mainSupplier(p) || activeSuppliers(p)[0];
  const second = activeSuppliers(p).find(s => s.vendorId !== main?.vendorId);
  const priceHistory: Record<string, { price: number; date: string }[]> = {};
  p.suppliers.forEach(s => {
    priceHistory[s.vendorId] = sortPrices(s.prices).reverse().map(pr => ({ price: pr.price, date: pr.effectiveDate }));
  });
  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    item_name: p.itemName,
    description: p.description,
    unit_size: p.unitSize,
    packing: p.packing,
    primary_vendor_id: main?.vendorId || null,
    primary_price: priceOn(main),
    secondary_vendor_id: second?.vendorId || null,
    secondary_price: priceOn(second),
    price_history: priceHistory,
    measuring_unit: p.measuringUnit || null,
    date_added: p.dateAdded,
    related_product_id: p.relatedProductIds && p.relatedProductIds.length > 0 ? JSON.stringify(p.relatedProductIds) : null,
  };
};

export const productSupplierToDb = (productId: string, s: ProductSupplier) => ({
  id: s.id,
  product_id: productId,
  vendor_id: s.vendorId,
  is_main: s.isMain,
  is_active: s.isActive,
  added_by: s.addedBy || null,
  added_at: s.addedAt,
});

export const productPriceToDb = (productId: string, vendorId: string, pr: ProductPrice) => ({
  id: pr.id,
  product_id: productId,
  vendor_id: vendorId,
  price: pr.price,
  effective_date: pr.effectiveDate,
  note: pr.note || null,
  created_by: pr.createdBy || null,
  created_at: pr.createdAt,
});

export const productActivityToDb = (a: ProductActivity) => ({
  id: a.id,
  product_id: a.productId,
  type: a.type,
  details: a.details,
  user_id: a.userId || null,
  user_name: a.userName || null,
  at: a.at,
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
  canCreateProducts: row.can_create_products ?? false,
  canAddProductSuppliers: row.can_add_product_suppliers ?? false,
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
  can_create_products: u.canCreateProducts ?? false,
  can_add_product_suppliers: u.canAddProductSuppliers ?? false,
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
