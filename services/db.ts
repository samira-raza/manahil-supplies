import { supabase } from './supabase';
import {
  vendorToDb, productToDb, productSupplierToDb, productPriceToDb, productActivityToDb, orderToDb, deliveryToDb,
  paymentToDb, userToDb, buyerToDb, categoryToDb, measuringUnitToDb
} from './mappers';
import { Vendor, Product, ProductActivity, Order, Delivery, Payment, User, Buyer, Category, MeasuringUnit } from '../types';

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

  // CATEGORIES
  async upsertCategory(c: Category) {
    return supabase.from('categories').upsert(categoryToDb(c));
  },
  async deleteCategory(id: string) {
    return supabase.from('categories').delete().eq('id', id);
  },

  // MEASURING UNITS
  async upsertMeasuringUnit(u: MeasuringUnit) {
    return supabase.from('measuring_units').upsert(measuringUnitToDb(u));
  },
  async deleteMeasuringUnit(id: string) {
    return supabase.from('measuring_units').delete().eq('id', id);
  },
};
