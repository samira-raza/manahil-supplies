import { supabase } from './supabase';
import {
  vendorToDb, productToDb, productSupplierToDb, productPriceToDb, productActivityToDb, orderToDb, deliveryToDb,
  paymentToDb, userToDb, buyerToDb, categoryToDb, categoryActivityToDb, measuringUnitToDb, brandToDb, brandActivityToDb
} from './mappers';
import { Vendor, Product, ProductActivity, Order, Delivery, Payment, User, Buyer, Category, CategoryActivity, MeasuringUnit, Brand, BrandSet, BrandActivity } from '../types';

export const db = {
  // VENDORS
  async upsertVendor(v: Vendor) {
    return supabase.from('vendors').upsert(vendorToDb(v));
  },
  async deleteVendor(id: string) {
    return supabase.from('vendors').delete().eq('id', id);
  },

  // PRODUCTS
  async upsertProduct(p: Product) {
    return supabase.from('products').upsert(productToDb(p));
  },
  async deleteProduct(id: string) {
    return supabase.from('products').delete().eq('id', id);
  },
  // Archive state is saved on its own, so ordinary product saves never change it
  async setProductArchived(id: string, archived: boolean, by?: string) {
    return supabase.from('products').update({
      is_archived: archived,
      archived_by: archived ? by || null : null,
      archived_at: archived ? new Date().toISOString() : null,
    }).eq('id', id);
  },
  // Keeps a record of a deleted product (its own activity log is deleted with it)
  async recordDeletedProduct(entry: { id: string; productId: string; title: string; snapshot: any; deletedBy?: string }) {
    return supabase.from('deleted_products').insert({
      id: entry.id,
      product_id: entry.productId,
      title: entry.title,
      snapshot: entry.snapshot,
      deleted_by: entry.deletedBy || null,
    });
  },
  // Two-way links: one row per pair, smaller id first
  async addProductLinks(productId: string, otherIds: string[], by?: string) {
    if (otherIds.length === 0) return { error: null };
    const rows = otherIds.filter(o => o !== productId).map(o => ({
      product_a: productId < o ? productId : o,
      product_b: productId < o ? o : productId,
      created_by: by || null,
    }));
    return supabase.from('product_links').upsert(rows, { onConflict: 'product_a,product_b', ignoreDuplicates: true });
  },
  async removeProductLink(a: string, b: string) {
    return supabase.from('product_links').delete()
      .eq('product_a', a < b ? a : b)
      .eq('product_b', a < b ? b : a);
  },
  // Keeps the old one-way list column in step with the two-way links (for rollback)
  async setRelatedMirror(productId: string, ids: string[]) {
    return supabase.from('products')
      .update({ related_product_id: ids.length > 0 ? JSON.stringify(ids) : null })
      .eq('id', productId);
  },
  // Removes this product from other products' "linked product" lists
  async unlinkRelatedProduct(id: string, others: Product[]) {
    for (const p of others) {
      const ids = (p.relatedProductIds || []).filter(r => r !== id);
      const r = await supabase.from('products')
        .update({ related_product_id: ids.length > 0 ? JSON.stringify(ids) : null })
        .eq('id', p.id);
      if (r.error) return r;
    }
    return { error: null };
  },
  // Saves the product with all its suppliers and prices.
  // The main supplier is saved last so there is never more than one main at a time.
  async saveProductWithSuppliers(p: Product) {
    const res = await supabase.from('products').upsert(productToDb(p));
    if (res.error) return res;
    const suppliers = [...p.suppliers].sort((a, b) => Number(a.isMain) - Number(b.isMain));
    for (const s of suppliers) {
      const r = await supabase.from('product_suppliers').upsert(productSupplierToDb(p.id, s));
      if (r.error) return r;
    }
    const prices = p.suppliers.flatMap(s => s.prices.map(pr => productPriceToDb(p.id, s.vendorId, pr)));
    if (prices.length > 0) {
      const r = await supabase.from('product_prices').upsert(prices);
      if (r.error) return r;
    }
    return res;
  },
  async deleteProductPrice(id: string) {
    return supabase.from('product_prices').delete().eq('id', id);
  },
  async insertProductActivity(a: ProductActivity) {
    return supabase.from('product_activity').insert(productActivityToDb(a));
  },

  // ORDERS
  async upsertOrder(o: Order) {
    return supabase.from('orders').upsert(orderToDb(o));
  },
  async deleteOrder(id: string) {
    return supabase.from('orders').delete().eq('id', id);
  },

  // DELIVERIES
  async insertDelivery(d: Delivery) {
    return supabase.from('deliveries').insert(deliveryToDb(d));
  },
  async updateDeliveryStatus(id: string, challanStatus: string, statusDescription: string) {
    return supabase.from('deliveries').update({ challan_status: challanStatus, status_description: statusDescription }).eq('id', id);
  },
  async updateDeliveryFull(id: string, challanStatus: string, statusDescription: string, items: any[]) {
    return supabase.from('deliveries').update({ challan_status: challanStatus, status_description: statusDescription, items }).eq('id', id);
  },
  async deleteDelivery(id: string) {
    return supabase.from('deliveries').delete().eq('id', id);
  },

  // PAYMENTS
  async insertPayment(p: Payment) {
    return supabase.from('payments').insert(paymentToDb(p));
  },
  async upsertPayment(p: Payment) {
    return supabase.from('payments').upsert(paymentToDb(p));
  },

  // USERS
  async upsertUser(u: User) {
    return supabase.from('users').upsert(userToDb(u));
  },
  async deleteUser(id: string) {
    return supabase.from('users').delete().eq('id', id);
  },

  // BUYERS
  async upsertBuyer(b: Buyer) {
    return supabase.from('buyers').upsert(buyerToDb(b));
  },
  async deleteBuyer(id: string) {
    return supabase.from('buyers').delete().eq('id', id);
  },

  // BRANDS (D37)
  async upsertBrand(b: Brand) {
    return supabase.from('brands').upsert(brandToDb(b));
  },
  async deleteBrand(id: string) {
    return supabase.from('brands').delete().eq('id', id);
  },
  // A brand set is fixed once saved: created once with its members, never edited (only switched on/off)
  async insertBrandSet(s: BrandSet) {
    const res = await supabase.from('brand_sets').insert({ id: s.id, parent_id: s.parentId, is_active: s.isActive, created_by: s.createdBy || null });
    if (res.error) return res;
    return supabase.from('brand_set_members').insert(s.childIds.map(c => ({ set_id: s.id, child_id: c })));
  },
  async setBrandSetActive(id: string, isActive: boolean) {
    return supabase.from('brand_sets').update({ is_active: isActive }).eq('id', id);
  },
  async deleteBrandSet(id: string) {
    return supabase.from('brand_sets').delete().eq('id', id);
  },
  async insertBrandActivity(a: BrandActivity) {
    return supabase.from('brand_activity').insert(brandActivityToDb(a));
  },
  // After a brand spelling fix: product names and the old typed brand are rebuilt
  async updateProductNames(updates: { id: string; title: string; brand: string }[]) {
    for (const u of updates) {
      const r = await supabase.from('products').update({ title: u.title, brand: u.brand }).eq('id', u.id);
      if (r.error) return r;
    }
    return { error: null };
  },

  // CATEGORIES (D38)
  async upsertCategory(c: Category) {
    return supabase.from('categories').upsert(categoryToDb(c));
  },
  // The database refuses this while any product is linked to the category
  async deleteCategory(id: string) {
    return supabase.from('categories').delete().eq('id', id);
  },
  async insertCategoryActivity(a: CategoryActivity) {
    return supabase.from('category_activity').insert(categoryActivityToDb(a));
  },
  // After the category's word in product names changes: each product's name and category word are rebuilt
  async updateProductCategoryNames(updates: { id: string; title: string; category: string; categoryId: string }[]) {
    for (const u of updates) {
      const r = await supabase.from('products').update({ title: u.title, category: u.category, category_id: u.categoryId }).eq('id', u.id);
      if (r.error) return r;
    }
    return { error: null };
  },

  // MEASURING UNITS
  async upsertMeasuringUnit(u: MeasuringUnit) {
    return supabase.from('measuring_units').upsert(measuringUnitToDb(u));
  },
  async deleteMeasuringUnit(id: string) {
    return supabase.from('measuring_units').delete().eq('id', id);
  },
};
