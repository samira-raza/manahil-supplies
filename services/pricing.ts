import { Product, ProductSupplier, ProductPrice, Order, DeliveryItem } from '../types';

// Today's date in local time as YYYY-MM-DD (toISOString would give the UTC date)
export const localToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Prices sorted newest effective date first (ties: last entered first)
export const sortPrices = (prices: ProductPrice[]) =>
  [...prices].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate) || (b.createdAt || '').localeCompare(a.createdAt || ''));

// The price that applies on a date: the latest effective date on or before it
export const priceRecordOn = (s: ProductSupplier | undefined, date: string = localToday()) =>
  s ? sortPrices(s.prices).find(p => p.effectiveDate <= date) : undefined;

export const priceOn = (s: ProductSupplier | undefined, date?: string) => priceRecordOn(s, date)?.price ?? 0;

export const mainSupplier = (p?: Product) => p?.suppliers.find(s => s.isMain);
export const activeSuppliers = (p?: Product) => (p?.suppliers || []).filter(s => s.isActive);
export const supplierOf = (p: Product | undefined, vendorId?: string) =>
  vendorId ? p?.suppliers.find(s => s.vendorId === vendorId) : undefined;

// Linked to the product at all (active or stopped), used for what a vendor may see
export const hasSupplier = (p: Product | undefined, vendorId?: string) => !!supplierOf(p, vendorId);
export const hasActiveSupplier = (p: Product | undefined, vendorId?: string) => !!supplierOf(p, vendorId)?.isActive;

export const priceFor = (p: Product | undefined, vendorId?: string, date?: string) => priceOn(supplierOf(p, vendorId), date);

// Suppliers in display order: main first, then active, then stopped
export const orderedSuppliers = (p: Product) =>
  [...p.suppliers].sort((a, b) => Number(b.isMain) - Number(a.isMain) || Number(b.isActive) - Number(a.isActive) || a.addedAt.localeCompare(b.addedAt));

// Supplier and value of one delivered line: the supplier the order was placed with, at the order's locked price.
// Old orders without a supplier fall back to the product's main supplier and today's price.
export const deliveryLine = (item: DeliveryItem, orders: Order[], products: Product[]) => {
  const order = orders.find(o => o.orderNumber === item.orderNumber);
  const line = order?.items.find(i => i.productId === item.productId);
  const product = products.find(p => p.id === item.productId);
  const vendorId = order?.vendorId || mainSupplier(product)?.vendorId;
  const unitPrice = line ? line.unitPrice : priceFor(product, vendorId);
  return { vendorId, unitPrice, value: item.quantity * unitPrice };
};

// The supplier an order belongs to (orders without one fall back to the main supplier of their products)
export const orderBelongsTo = (o: Order, vendorId: string | undefined, products: Product[]) => {
  if (!vendorId) return false;
  if (o.vendorId) return o.vendorId === vendorId;
  return o.items.some(i => mainSupplier(products.find(p => p.id === i.productId))?.vendorId === vendorId);
};
