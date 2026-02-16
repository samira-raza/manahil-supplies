
import { DeliveryStatus, ChallanStatus, UserRole, Product, Vendor, Order, Delivery, User, Category, Buyer, MeasuringUnit } from '../types';

export const mockUsers: User[] = [
  { id: 'admin-1', name: 'Super Admin', mobile: '9876543210', password: 'admin123', role: UserRole.SUPER_ADMIN }
];

export const mockCategories: Category[] = [
  { id: '1', name: 'MTCN (Master Carton)', description: 'Outer corrugated shipping cartons for bulk transport' },
  { id: '2', name: 'Inner Carton', description: 'Secondary product packaging for retail shelf display' },
  { id: '3', name: 'Polybags', description: 'LDPE/HM protective bags for moisture proofing' },
  { id: '4', name: 'Labels & Stickers', description: 'Branding and instructional product labels' },
];

export const mockMeasuringUnits: MeasuringUnit[] = [
  { id: 'mu_1', name: 'Inch', symbol: 'in' },
  { id: 'mu_2', name: 'Millimeter', symbol: 'mm' },
  { id: 'mu_3', name: 'Centimeter', symbol: 'cm' },
  { id: 'mu_4', name: 'Meter', symbol: 'm' },
];

export const mockBuyers: Buyer[] = [
  { id: 'b_1', name: 'Amish Sharma', contactNumber: '98100 12345' },
  { id: 'b_2', name: 'Priya Verma', contactNumber: '98711 55667' },
  { id: 'b_3', name: 'Rahul Khanna', contactNumber: '99100 99887' }
];

export const mockVendors: Vendor[] = [
  {
    id: 's_alpha',
    name: 'Alpha Packaging Solutions',
    primaryContactName: 'John Doe',
    primaryMobile: '9988776655',
    bankAccounts: [
      { bankTitle: 'HDFC Bank', accountTitle: 'Alpha Packaging Solutions', branchName: 'Downtown', accountNumber: '50100123456789', ifsc: 'HDFC0001234' }
    ],
    contact: { phone: '9988776655', email: 'sales@alphapack.com', address: '123 Industrial Area, Sector 5' }
  },
  {
    id: 's_zenith',
    name: 'Zenith Corrugators',
    primaryContactName: 'Jane Smith',
    primaryMobile: '9911223344',
    bankAccounts: [
      { bankTitle: 'ICICI Bank', accountTitle: 'Zenith Corrugators', branchName: 'North Wing', accountNumber: '001122334455', ifsc: 'ICIC0000011' }
    ],
    contact: { phone: '9911223344', email: 'orders@zenith.in', address: 'Plot 45, Manufacturing Hub' }
  }
];

export const mockProducts: Product[] = [
  {
    id: 'p_mtcn_1',
    brand: 'LogiPack',
    category: 'MTCN (Master Carton)',
    itemName: 'Heavy Duty 5-Ply Outer',
    description: 'Premium quality corrugated outer carton for bulk shipping',
    unitSize: '60x40x40 cm',
    packing: 'Bundle of 20',
    title: 'LogiPack MTCN (Master Carton) Heavy Duty 5-Ply Outer 60x40x40 cm Bundle of 20',
    primaryVendorId: 's_alpha',
    primaryPrice: 1.25,
    secondaryVendorId: 's_zenith',
    secondaryPrice: 1.30,
    priceHistory: {
      's_alpha': [{ price: 1.20, date: '2023-12-01' }, { price: 1.25, date: '2024-01-15' }],
      's_zenith': [{ price: 1.30, date: '2024-01-15' }]
    },
    dateAdded: '2024-01-15'
  },
  {
    id: 'p_inner_1',
    brand: 'RetailBox',
    category: 'Inner Carton',
    itemName: 'E-Flute Product Case',
    description: 'Lightweight inner carton for retail product packaging',
    unitSize: '15x10x10 cm',
    packing: 'Pack of 100',
    title: 'RetailBox Inner Carton E-Flute Product Case 15x10x10 cm Pack of 100',
    primaryVendorId: 's_alpha',
    primaryPrice: 0.15,
    secondaryVendorId: '',
    secondaryPrice: 0,
    priceHistory: {
      's_alpha': [{ price: 0.15, date: '2024-02-10' }]
    },
    dateAdded: '2024-02-10'
  }
];

export const mockOrders: Order[] = [
  {
    id: 'ord_1',
    orderNumber: 'ORD-2024-1001',
    poNumber: 'PO/IND/882',
    vendorId: 's_alpha',
    date: '2024-05-01',
    placedBy: 'Amish Sharma',
    buyerId: 'b_1',
    confirmedBy: 'Alpha Sales',
    items: [
      { productId: 'p_mtcn_1', quantity: 500, unitPrice: 1.25, status: DeliveryStatus.PARTIAL },
      { productId: 'p_inner_1', quantity: 1000, unitPrice: 0.15, status: DeliveryStatus.PENDING }
    ],
    totalAmount: 775.00
  }
];

export const mockDeliveries: Delivery[] = [
  {
    id: 'del_1',
    challanNumber: 'CH-1001',
    deliveryDate: '2024-05-10',
    challanStatus: ChallanStatus.ACTIVE,
    items: [
      { 
        productId: 'p_mtcn_1', 
        quantity: 300, 
        orderNumber: 'ORD-2024-1001', 
        newStatus: DeliveryStatus.PARTIAL 
      }
    ]
  }
];
