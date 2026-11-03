import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demo-store';
import { useNetworkStore } from '@/lib/network';
import type { Product, Category, Sale, SaleItem, PaymentMethod, PaymentStatus } from '@/types';

export interface SyncResult {
  success: boolean;
  message: string;
  categoriesCount?: number;
  productsCount?: number;
  /** Items that exist only on this device and were never uploaded to the cloud. */
  localOnlyCategories?: number;
  localOnlyProducts?: number;
  error?: string;
}

export interface SalesFetchResult {
  success: boolean;
  message: string;
  sales: Sale[];
}

interface CloudSaleRow {
  id: string;
  receipt_no: string;
  cashier_id: string | null;
  cashier_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  payment_method: string;
  payment_status: string;
  created_at: string;
  sale_items: {
    product_id: string;
    name: string;
    unit_price: number;
    cost_price: number;
    qty: number;
    line_total: number;
  }[] | null;
}

/**
 * Reads recorded sales (with their line items) back from the database.
 * The database is the single source of truth, so every admin screen shows the
 * same numbers that were actually committed — not a local copy.
 */
export async function fetchSalesFromCloud(limit = 500): Promise<SalesFetchResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, message: 'Supabase credentials not configured.', sales: [] };
  }
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('id, receipt_no, cashier_id, cashier_name, subtotal, discount, tax, total, coupon_code, payment_method, payment_status, created_at, sale_items(product_id, name, unit_price, cost_price, qty, line_total)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, message: error.message, sales: [] };

    const sales: Sale[] = ((data ?? []) as CloudSaleRow[]).map((row) => {
      const items: SaleItem[] = (row.sale_items ?? []).map((it) => ({
        product_id: it.product_id,
        name: it.name,
        unit_price: Number(it.unit_price),
        cost_price: Number(it.cost_price),
        qty: Number(it.qty),
        line_total: Number(it.line_total),
      }));
      return {
        id: row.id,
        receipt_no: row.receipt_no,
        cashier_id: row.cashier_id ?? '',
        cashier_name: row.cashier_name ?? '',
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        tax: Number(row.tax),
        total: Number(row.total),
        coupon_code: row.coupon_code,
        payment_method: row.payment_method as PaymentMethod,
        payment_status: row.payment_status as PaymentStatus,
        created_at: row.created_at,
        items,
      };
    });

    return { success: true, message: `Loaded ${sales.length} sale(s) from the cloud.`, sales };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err), sales: [] };
  }
}

/** Returns true when the local copy was edited more recently than the cloud copy. */
function isLocalNewer(local: string | null | undefined, remote: string | null | undefined): boolean {
  if (!local) return false;
  if (!remote) return true;
  return new Date(local).getTime() > new Date(remote).getTime();
}

/**
 * Loads the shop details (name, address, phone, UPI, tax) from the cloud so the
 * business name is never hardcoded in the UI, receipts or exports.
 * The public app key is allowed to read this table, so it works before sign-in too.
 */
export async function syncBusinessSettings(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data, error } = await supabase.from('business_settings').select('*').limit(1).maybeSingle();
    if (error || !data) return;
    useDemoStore.setState((s) => ({
      settings: {
        ...s.settings,
        business_name: data.business_name ?? s.settings.business_name,
        logo_url: data.logo_url ?? s.settings.logo_url,
        phone: data.phone ?? s.settings.phone,
        address: data.address ?? s.settings.address,
        upi_id: data.upi_id ?? s.settings.upi_id,
        upi_name: data.upi_name ?? s.settings.upi_name,
        tax_rate: Number(data.tax_rate ?? s.settings.tax_rate),
        currency: data.currency ?? s.settings.currency,
      },
    }));
  } catch (err) {
    // The shop details keep their last known values when the cloud is unreachable.
    console.warn('Could not load business settings from the cloud:', err);
  }
}

/**
 * Synchronizes categories and products from Supabase cloud database to the local Zustand store.
 * Allows Web and Android devices to share items in real-time.
 */
export async function syncCatalogFromSupabase(): Promise<SyncResult> {
  const report = useNetworkStore.getState().reportSync;

  if (!isSupabaseConfigured || !supabase) {
    const result: SyncResult = {
      success: false,
      message: 'Supabase credentials not configured — showing locally stored items only.',
    };
    report(result);
    return result;
  }

  // Trigger network health check
  useNetworkStore.getState().checkConnection();

  try {
    const [catRes, prodRes] = await Promise.all([
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('products').select('*'),
    ]);

    if (catRes.error) {
      console.warn('Supabase categories fetch error:', catRes.error.message);
      const result: SyncResult = {
        success: false,
        message: `Failed to load cloud categories: ${catRes.error.message}`,
        error: catRes.error.message,
      };
      report(result);
      return result;
    }

    if (prodRes.error) {
      console.warn('Supabase products fetch error:', prodRes.error.message);
      const result: SyncResult = {
        success: false,
        message: `Failed to load cloud products: ${prodRes.error.message}`,
        error: prodRes.error.message,
      };
      report(result);
      return result;
    }

    let catCount = 0;
    let prodCount = 0;
    let localOnlyCategories = 0;
    let localOnlyProducts = 0;

    if (catRes.data) {
      const storeCategories = useDemoStore.getState().categories;
      const localById = new Map(storeCategories.map((c) => [c.id, c]));
      const remoteCategories: Category[] = catRes.data.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        image_url: row.image_url,
        display_order: row.display_order,
        active: row.active,
        updated_at: row.updated_at,
      }));

      catCount = remoteCategories.length;
      // Merge: a locally edited row (newer updated_at) wins, otherwise the cloud row wins.
      const remoteIds = new Set(remoteCategories.map((c) => c.id));
      const merged = remoteCategories.map((remote) => {
        const local = localById.get(remote.id);
        return local && isLocalNewer(local.updated_at, remote.updated_at) ? local : remote;
      });
      const localOnly = storeCategories.filter((c) => !remoteIds.has(c.id));
      localOnlyCategories = localOnly.length;
      useDemoStore.setState({
        categories: [...merged, ...localOnly].sort((a, b) => a.display_order - b.display_order),
      });
    }

    if (prodRes.data) {
      const storeProducts = useDemoStore.getState().products;
      const localById = new Map(storeProducts.map((p) => [p.id, p]));
      const remoteProducts: Product[] = prodRes.data.map((row) => ({
        id: row.id,
        category_id: row.category_id,
        name: row.name,
        sku: row.sku,
        description: row.description,
        image_url: row.image_url,
        selling_price: Number(row.selling_price),
        cost_price: Number(row.cost_price),
        unit: row.unit,
        stock: Number(row.stock),
        low_stock_threshold: Number(row.low_stock_threshold),
        expiry_date: row.expiry_date,
        batch_number: row.batch_number,
        active: row.active,
        updated_at: row.updated_at,
      }));

      prodCount = remoteProducts.length;
      // Merge: a locally edited row (newer updated_at) wins, otherwise the cloud row wins.
      const remoteIds = new Set(remoteProducts.map((p) => p.id));
      const merged = remoteProducts.map((remote) => {
        const local = localById.get(remote.id);
        return local && isLocalNewer(local.updated_at, remote.updated_at) ? local : remote;
      });
      const localOnly = storeProducts.filter((p) => !remoteIds.has(p.id));
      localOnlyProducts = localOnly.length;
      useDemoStore.setState({ products: [...merged, ...localOnly] });
    }

    const drifted = localOnlyProducts + localOnlyCategories > 0;
    const result: SyncResult = {
      success: true,
      message: drifted
        ? `Synced ${prodCount} products and ${catCount} categories. ${localOnlyProducts} product(s) and ${localOnlyCategories} category(ies) exist only on this device (never uploaded).`
        : `Synced ${prodCount} products and ${catCount} categories from the cloud.`,
      categoriesCount: catCount,
      productsCount: prodCount,
      localOnlyCategories,
      localOnlyProducts,
    };
    report(result);
    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('Catalog sync from Supabase note:', errorMsg);
    const result: SyncResult = {
      success: false,
      message: `Cloud sync failed: ${errorMsg}`,
      error: errorMsg,
    };
    report(result);
    return result;
  }
}
