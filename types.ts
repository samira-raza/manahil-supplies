
// Categories (agreed 12 Nov 2026, D38). Three names, each unique:
// name = the word used in product names (e.g. MTCN), fullName = shown in lists (Master Carton),
// shortCode = used in product codes (MC).
export interface Category {
  id: string;
  name: string;
  fullName?: string;
  shortCode?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface CategoryActivity {
  id: string;
  categoryId?: string;
  type: 'SET_UP' | 'CREATED' | 'FULL_NAME_CHANGED' | 'WORD_CHANGED' | 'CODE_CHANGED' | 'DELETED';
  details: string;
  userId?: string;
  userName?: string;
  at: string;
}

// Brands (agreed 12 Nov 2026, D37). A parent brand has no parentId and has initials.
// A child brand has a parentId. A brand set is a parent plus chosen child brands, fixed once saved.
export interface Brand {
  id: string;
  name: string;
  parentId?: string;
  initials?: string; // parent brands only, 2-3 capital letters, unique
  label?: string;    // parent brands only, optional short label shown under product names
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface BrandSet {
  id: string;
  parentId: string;
  childIds: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface BrandActivity {
  id: string;
  brandId?: string;
  setId?: string;
  type: 'CREATED' | 'RENAMED' | 'INITIALS_CHANGED' | 'LABEL_CHANGED' | 'DISABLED' | 'ENABLED' | 'MOVED' | 'DELETED';
  details: string;
  userId?: string;
  userName?: string;
  at: string;
}

export interface MeasuringUnit {
  id: string;
  name: string;
  symbol: string;
}

export enum DeliveryStatus {
  COMPLETE = 'Complete',
  PARTIAL = 'Partial Delivered',
  PENDING = 'Pending',
  RETURN = 'Return'
}

export enum ChallanStatus {
  ACTIVE = 'Active',
  CANCELLED = 'Cancelled',
  RETURNED = 'Returned',
  PARTIAL_RETURNED = 'Partial Returned'
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  VENDOR = 'VENDOR',
  VENDOR_STAFF = 'VENDOR_STAFF'
}

export interface User {
  id: string;
  name: string;
  mobile: string;
  password: string;
  role: UserRole;
  vendorId?: string;
  allowedVendorIds?: string[];
  isActive?: boolean;
  mustResetPassword?: boolean;
  canCreateProducts?: boolean;
  canAddProductSuppliers?: boolean;
}

export interface Buyer {
  id: string;
  name: string;
  contactNumber: string;
}

export interface BankAccount {
  bankTitle: string;
  accountTitle: string;
  branchName: string;
  accountNumber: string;
  ifsc?: string;
}

export interface Vendor {
  id: string;
  name: string;
  primaryContactName: string;
  primaryMobile: string;
  openingBalance?: number;
  bankAccounts: BankAccount[];
  contact: {
    phone: string;
    email: string;
    address: string;
  };
}

// One price for one supplier of one product, valid from its effective date
export interface ProductPrice {
  id: string;
  price: number;
  effectiveDate: string; // YYYY-MM-DD
  note?: string;
  createdBy?: string;
  createdAt: string;
}

// A supplier linked to a product. Never deleted, only disabled.
export interface ProductSupplier {
  id: string;
  vendorId: string;
  isMain: boolean;
  isActive: boolean;
  addedBy?: string;
  addedAt: string;
  prices: ProductPrice[];
}

export type ProductActivityType =
  | 'SUPPLIER_ADDED' | 'MAIN_SWITCHED' | 'SUPPLIER_REPLACED'
  | 'SUPPLIER_DISABLED' | 'SUPPLIER_ENABLED'
  | 'PRICE_ADDED' | 'PRICE_EDITED' | 'PRICE_DELETED'
  | 'ARCHIVED' | 'RESTORED'
  | 'COPIED_FROM'
  | 'LINK_ADDED' | 'LINK_REMOVED'
  | 'CATEGORY_CHANGED';

export interface ProductActivity {
  id: string;
  productId: string;
  type: ProductActivityType;
  details: string;
  userId?: string;
  userName?: string;
  at: string;
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;   // the category's word used in product names (kept for older app versions)
  categoryId?: string; // the category itself (D38)
  itemName: string;
  description: string;
  unitSize: string;
  packing: string;

  suppliers: ProductSupplier[];
  activity: ProductActivity[];
  measuringUnit?: string;
  dateAdded: string;
  relatedProductIds?: string[];
  // 'PER_ORDER' = no fixed price (e.g. custom stickers): the price is typed on each order line
  priceMode?: 'LIST' | 'PER_ORDER';
  // One brand entry per product: a parent brand alone, or a brand set (D37). `brand` keeps the parent's name.
  brandParentId?: string;
  brandSetId?: string;
  // Archived products stay visible but cannot be ordered
  isArchived?: boolean;
  archivedBy?: string;
  archivedAt?: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number; // Price at the time of order (locked in)
  status: DeliveryStatus; // Current line item status
  includesDisabledBrand?: boolean; // ordered on purpose despite a disabled brand (D37)
}

export interface Order {
  id: string;
  orderNumber: string;
  poNumber?: string;
  vendorId?: string; // Target vendor
  date: string;
  placedBy: string;
  buyerId?: string;
  confirmedBy: string;
  items: OrderItem[];
  totalAmount: number;
}

export interface DeliveryItem {
  orderNumber: string;
  productId: string;
  quantity: number;
  newStatus: DeliveryStatus;
  itemStatus?: ChallanStatus;
  itemStatusDescription?: string;
}

export interface Delivery {
  id: string;
  challanNumber: string;
  deliveryDate: string;
  challanStatus: ChallanStatus;
  statusDescription?: string;
  items: DeliveryItem[]; // One challan can have items from multiple orders
}

export interface StagedDispatchItem extends DeliveryItem {
  productTitle: string;
}

export interface Payment {
  id: string;
  vendorId: string;
  amount: number;
  date: string;
  method?: 'cash' | 'bank' | 'invoice' | 'adjustment';
  bankAccount?: string;
  invoiceNumber?: string;
  reference?: string;
  note?: string;
}
