import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '@/types';
import { newId } from '@/lib/calculations';

interface CartState {
  items: CartItem[];
  add: (product: Product, qty?: number) => void;
  /** Adds a manually typed line — an item that is not in the catalog (empty bill). */
  addCustom: (name: string, unitPrice: number, qty?: number) => void;
  inc: (productId: string) => void;
  dec: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setQty: (productId: string, qty: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product, qty = 1) => set((s) => {
        const existing = s.items.find((i) => i.product_id === product.id);
        if (existing) {
          return {
            items: s.items.map((i) =>
              i.product_id === product.id
                ? { ...i, qty: Math.min(i.qty + qty, i.max_stock) }
                : i,
            ),
          };
        }
        return {
          items: [
            ...s.items,
            {
              product_id: product.id,
              name: product.name,
              image_url: product.image_url,
              unit_price: product.selling_price,
              unit: product.unit,
              max_stock: product.stock,
              qty: Math.min(qty, product.stock),
            },
          ],
        };
      }),
      // A manually typed line: it is not in the catalog, so it has no stock limit.
      addCustom: (name, unitPrice, qty = 1) => set((s) => ({
        items: [
          ...s.items,
          {
            product_id: `custom-${newId()}`,
            name: name.trim(),
            image_url: null,
            unit_price: unitPrice,
            unit: 'manual',
            max_stock: 999,
            qty,
            is_custom: true,
          },
        ],
      })),
      inc: (productId) => set((s) => ({
        items: s.items.map((i) =>
          i.product_id === productId && i.qty < i.max_stock
            ? { ...i, qty: i.qty + 1 }
            : i,
        ),
      })),
      dec: (productId) => set((s) => ({
        items: s.items
          .map((i) => (i.product_id === productId ? { ...i, qty: i.qty - 1 } : i))
          .filter((i) => i.qty > 0),
      })),
      setQty: (productId, qty) => set((s) => ({
        items: s.items.map((i) =>
          i.product_id === productId
            ? { ...i, qty: Math.max(0, Math.min(qty, i.max_stock)) }
            : i,
        ).filter((i) => i.qty > 0),
      })),
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.product_id !== productId) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'alpha-cart' },
  ),
);
