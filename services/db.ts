import { supabase } from './supabase';
import {
  vendorToDb, productToDb, orderToDb, deliveryToDb,
  paymentToDb, userToDb, buyerToDb, categoryToDb, measuringUnitToDb
} from './mappers';
import { Vendor, Product, Order, Delivery, Payment, User, Buyer, Category, MeasuringUnit } from '../types';

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
