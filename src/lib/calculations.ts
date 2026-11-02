import type { CartItem, Coupon } from '@/types';

export const money = (n: number): string =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const formatCurrency = (n: number, currency = '₹'): string => `${currency}${money(n)}`;

export interface BillTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
  distinctCount: number;
}

export function calcTotals(items: CartItem[], coupon: Coupon | null, taxRate: number): BillTotals {
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  let discount = 0;
  if (coupon && subtotal >= coupon.min_amount) {
    if (coupon.discount_type === 'percentage') {
      discount = (subtotal * coupon.discount_value) / 100;
      if (coupon.max_discount != null) discount = Math.min(discount, coupon.max_discount);
    } else {
      discount = coupon.discount_value;
    }
    discount = Math.min(discount, subtotal);
  }
  const taxable = Math.max(0, subtotal - discount);
  const tax = (taxable * taxRate) / 100;
  const total = taxable + tax;
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    total: round2(total),
    itemCount,
    distinctCount: items.length,
  };
}

export function validateCoupon(
  coupon: Coupon | null,
  subtotal: number,
): { ok: boolean; message: string } {
  if (!coupon) return { ok: false, message: 'No coupon entered.' };
  if (!coupon.active) return { ok: false, message: 'Coupon is not active.' };
  const today = new Date().toISOString().slice(0, 10);
  if (today < coupon.start_date) return { ok: false, message: 'Coupon not yet valid.' };
  if (today > coupon.expiry_date) return { ok: false, message: 'Coupon has expired.' };
  if (subtotal < coupon.min_amount)
    return { ok: false, message: `Minimum bill of ₹${coupon.min_amount} required.` };
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit)
    return { ok: false, message: 'Coupon usage limit reached.' };
  return { ok: true, message: 'Coupon applied successfully.' };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const newReceiptNo = (existing: number) => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `R${ymd}-${String(existing + 1).padStart(4, '0')}`;
};
