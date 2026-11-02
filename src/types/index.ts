export type Role = 'admin' | 'cashier';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
  updated_at?: string | null;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  sku: string;
  description: string | null;
  image_url: string | null;
  selling_price: number;
  cost_price: number;
  unit: string;
  stock: number;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
  active: boolean;
  updated_at?: string | null;
}

export interface CartItem {
  product_id: string;
  name: string;
  image_url: string | null;
  unit_price: number;
  unit: string;
  max_stock: number;
  qty: number;
}

export type PaymentMethod = 'cash' | 'upi';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface Sale {
  id: string;
  receipt_no: string;
  cashier_id: string;
  cashier_name: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  created_at: string;
  items: SaleItem[];
}

export interface SaleItem {
  product_id: string;
  name: string;
  unit_price: number;
  cost_price: number;
  qty: number;
  line_total: number;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_amount: number;
  max_discount: number | null;
  start_date: string;
  expiry_date: string;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

export interface PurchaseInvoice {
  id: string;
  supplier_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
}

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: 'in' | 'out' | 'adjustment' | 'sale' | 'expired' | 'damaged';
  quantity: number;
  reason: string | null;
  created_at: string;
}

export interface BusinessSettings {
  business_name: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  upi_id: string;
  upi_name: string;
  tax_rate: number;
  currency: string;
}
