
export interface Category {
  id: string;
  name: string;
  description?: string;
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
  | 'COPIED_FROM';

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
  category: string;
  itemName: string;
  description: string;
  unitSize: string;
  packing: string;

  suppliers: ProductSupplier[];
  activity: ProductActivity[];
  measuringUnit?: string;
  dateAdded: string;
  relatedProductIds?: string[];
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
