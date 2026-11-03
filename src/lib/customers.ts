import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  notes: string | null;
  created_at?: string | null;
}

export interface CustomerSummary extends Customer {
  bill_count: number;
  total_billed: number;
  last_bill_at: string | null;
}

export interface CustomerBill {
  id: string;
  receipt_no: string;
  total: number;
  payment_status: string;
  payment_method: string;
  created_at: string;
}

/**
 * Looks up buyers by name or phone. Used at the till and in the admin registry.
 * The cloud is the only source of truth — nothing is cached on the device.
 */
export async function listCustomers(search = '', limit = 300): Promise<Customer[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let query = supabase
    .from('customers')
    .select('id, name, phone, location, notes, created_at')
    .order('name')
    .limit(limit);

  const term = search.trim();
  if (term) {
    const safe = term.replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Could not load buyers:', error.message);
    return [];
  }
  return (data ?? []) as Customer[];
}

/** One row per buyer with their running account totals (bills, amount spent). */
export async function listCustomerSummary(): Promise<CustomerSummary[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc('cust_summary');
  if (error) {
    console.warn('Could not load the buyer ledger:', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.customer_id),
    name: String(row.customer_name ?? ''),
    phone: (row.phone as string) ?? null,
    location: (row.location as string) ?? null,
    notes: (row.notes as string) ?? null,
    bill_count: Number(row.bill_count ?? 0),
    total_billed: Number(row.total_billed ?? 0),
    last_bill_at: (row.last_bill_at as string) ?? null,
  }));
}

/** The bills recorded against one buyer, newest first. */
export async function listCustomerBills(customerId: string): Promise<CustomerBill[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('sales')
    .select('id, receipt_no, total, payment_status, payment_method, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('Could not load the buyer bills:', error.message);
    return [];
  }
  return (data ?? []) as CustomerBill[];
}

export interface CustomerInput {
  name: string;
  phone?: string;
  location?: string;
  notes?: string;
}

export async function createCustomer(
  input: CustomerInput,
): Promise<{ ok: boolean; message: string; customer?: Customer }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'The cloud server is not configured.' };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, message: 'Enter the buyer name.' };

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name,
      phone: input.phone?.trim() || null,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('id, name, phone, location, notes, created_at')
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${name} was added to the buyer registry.`, customer: data as Customer };
}

export async function updateCustomer(id: string, patch: CustomerInput): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'The cloud server is not configured.' };
  }
  const { error } = await supabase
    .from('customers')
    .update({
      name: patch.name.trim(),
      phone: patch.phone?.trim() || null,
      location: patch.location?.trim() || null,
      notes: patch.notes?.trim() || null,
    })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Buyer details updated.' };
}

export async function deleteCustomer(id: string): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'The cloud server is not configured.' };
  }
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Buyer removed.' };
}
