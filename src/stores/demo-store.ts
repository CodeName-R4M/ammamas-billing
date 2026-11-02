import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Category, Product, Coupon, Supplier, BusinessSettings, Sale, StockMovement, StockMovement as Movement } from '@/types';
import { newId } from '@/lib/calculations';

const defaultSettings: BusinessSettings = {
  business_name: 'Ammamas Billing',
  logo_url: null,
  phone: null,
  address: null,
  upi_id: '',
  upi_name: 'Ammamas',
  tax_rate: 0,
  currency: '₹',
};

export interface StockInInput {
  productId: string;
  qty: number;
  unitCost: number;
  reason: string;
  expiry_date: string | null;
  batch_number: string | null;
}

interface DemoState {
  categories: Category[];
  products: Product[];
  coupons: Coupon[];
  suppliers: Supplier[];
  settings: BusinessSettings;
  sales: Sale[];
  stockMovements: Movement[];
  clearAllData: () => void;
  upsertCategory: (c: Category) => void;
  upsertProduct: (p: Product) => void;
  upsertCoupon: (c: Coupon) => void;
  upsertSupplier: (s: Supplier) => void;
  updateSettings: (s: Partial<BusinessSettings>) => void;
  addSale: (sale: Sale, movements: StockMovement[]) => void;
  stockIn: (input: StockInInput) => void;
  adjustStock: (productId: string, qty: number, reason: string, type: 'adjustment' | 'expired' | 'damaged') => void;
}

const movementFor = (product: Product, type: Movement['movement_type'], qty: number, reason: string): Movement => ({
  id: newId(),
  product_id: product.id,
  product_name: product.name,
  movement_type: type,
  quantity: qty,
  reason,
  created_at: new Date().toISOString(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      categories: [],
      products: [],
      coupons: [],
      suppliers: [],
      settings: defaultSettings,
      sales: [],
      stockMovements: [],

      clearAllData: () => set({
        categories: [], products: [], coupons: [],
        suppliers: [], sales: [], stockMovements: [],
      }),

      upsertCategory: (c) => set((s) => {
        const stamped = { ...c, updated_at: new Date().toISOString() };
        const exists = s.categories.some((x) => x.id === c.id);
        const next = exists ? s.categories.map((x) => (x.id === c.id ? stamped : x)) : [...s.categories, stamped];
        return { categories: next.sort((a, b) => a.display_order - b.display_order) };
      }),

      upsertProduct: (p) => set((s) => {
        const stamped = { ...p, updated_at: new Date().toISOString() };
        const exists = s.products.some((x) => x.id === p.id);
        return { products: exists ? s.products.map((x) => (x.id === p.id ? stamped : x)) : [...s.products, stamped] };
      }),

      upsertCoupon: (c) => set((s) => {
        const exists = s.coupons.some((x) => x.id === c.id);
        return { coupons: exists ? s.coupons.map((x) => (x.id === c.id ? c : x)) : [...s.coupons, c] };
      }),

      upsertSupplier: (sup) => set((s) => {
        const exists = s.suppliers.some((x) => x.id === sup.id);
        return { suppliers: exists ? s.suppliers.map((x) => (x.id === sup.id ? sup : x)) : [...s.suppliers, sup] };
      }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addSale: (sale, movements) => set((s) => {
        const products = s.products.map((p) => {
          const line = sale.items.find((it) => it.product_id === p.id);
          return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
        });
        const coupons = sale.coupon_code
          ? s.coupons.map((c) => (c.code === sale.coupon_code ? { ...c, used_count: c.used_count + 1 } : c))
          : s.coupons;
        return {
          sales: [sale, ...s.sales],
          stockMovements: [...movements, ...s.stockMovements],
          products,
          coupons,
        };
      }),

      stockIn: (input) => set((s) => {
        const product = s.products.find((p) => p.id === input.productId);
        if (!product) return {};
        const newStock = product.stock + input.qty;
        // Moving weighted-average cost: blends the existing stock value with the new batch.
        const avgCost = newStock > 0
          ? (product.stock * product.cost_price + input.qty * input.unitCost) / newStock
          : input.unitCost;
        const updated: Product = {
          ...product,
          stock: newStock,
          cost_price: round2(avgCost),
          expiry_date: input.expiry_date ?? product.expiry_date,
          batch_number: input.batch_number ?? product.batch_number,
        };
        return {
          products: s.products.map((p) => (p.id === product.id ? updated : p)),
          stockMovements: [movementFor(product, 'in', input.qty, input.reason), ...s.stockMovements],
        };
      }),

      adjustStock: (productId, qty, reason, type) => set((s) => {
        const product = s.products.find((p) => p.id === productId);
        if (!product) return {};
        return {
          products: s.products.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, p.stock + qty) } : p)),
          stockMovements: [movementFor(product, type, qty, reason), ...s.stockMovements],
        };
      }),
    }),
    {
      name: 'alpha-digitronix-demo',
    },
  ),
);
