import { useState } from 'react';
import { Plus, Pencil, Power } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { newId } from '@/lib/calculations';
import { ExportButton } from '@/components/common/ExportButton';
import type { Supplier, Coupon } from '@/types';

const optionalEmail = z.string().trim().refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email');

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required'),
  contact_person: z.string(),
  phone: z.string().trim().refine((v) => v === '' || /^[+\d][\d\s-]{6,}$/.test(v), 'Enter a valid phone'),
  email: optionalEmail,
  address: z.string(),
  notes: z.string(),
  active: z.boolean(),
});
type SupplierForm = z.infer<typeof supplierSchema>;

export function AdminSuppliers() {
  const suppliers = useDemoStore((s) => s.suppliers);
  const upsert = useDemoStore((s) => s.upsertSupplier);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);

  const openNew = () => { setEditing(null); setOpen(true); };
  const toggle = (s: Supplier) => {
    upsert({ ...s, active: !s.active });
    toast.success(s.active ? 'Supplier deactivated' : 'Supplier activated');
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers.length} registered vendor suppliers`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Vendor Suppliers Master Directory',
                subtitle: `Total Suppliers: ${suppliers.length} · Ammamas Procurement`,
                filename: `ammamas-suppliers-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Supplier Name', key: 'name' },
                  { header: 'Contact Person', key: 'contact_person' },
                  { header: 'Phone', key: 'phone' },
                  { header: 'Email', key: 'email' },
                  { header: 'Address', key: 'address' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: suppliers.map((s) => ({
                  name: s.name,
                  contact_person: s.contact_person || '—',
                  phone: s.phone || '—',
                  email: s.email || '—',
                  address: s.address || '—',
                  status: s.active ? 'Active' : 'Inactive',
                })),
                summaryCards: [
                  { label: 'Total Suppliers', value: String(suppliers.length) },
                  { label: 'Active Suppliers', value: String(suppliers.filter((s) => s.active).length) },
                ],
              }}
            />
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} /> Add supplier
            </button>
          </div>
        }
      />
      {suppliers.length === 0 ? <Empty message="No suppliers yet." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutral-800">{s.name}</p>
                  <p className="text-xs text-neutral-400">{s.contact_person ?? 'No contact person'}</p>
                </div>
                <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-neutral-500">
                {s.phone && <p>{s.phone}</p>}
                {s.email && <p className="truncate">{s.email}</p>}
                {s.address && <p className="truncate">{s.address}</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setEditing(s); setOpen(true); }} className="btn-secondary flex-1 py-2 text-xs"><Pencil size={14} /> Edit</button>
                <button onClick={() => toggle(s)} className={`btn px-3 py-2 text-xs ${s.active ? 'text-warning-600' : 'text-success-600'}`} aria-label="Toggle supplier"><Power size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <SupplierModal
          key={editing?.id ?? 'new'}
          supplier={editing}
          onClose={() => setOpen(false)}
          onSave={(s) => { upsert(s); setOpen(false); toast.success('Supplier saved'); }}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSave }: { supplier: Supplier | null; onClose: () => void; onSave: (s: Supplier) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? '', contact_person: supplier?.contact_person ?? '', phone: supplier?.phone ?? '',
      email: supplier?.email ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '', active: supplier?.active ?? true,
    },
  });
  const submit = (v: SupplierForm) => onSave({
    id: supplier?.id ?? newId(),
    name: v.name.trim(),
    contact_person: v.contact_person.trim() || null,
    phone: v.phone.trim() || null,
    email: v.email.trim() || null,
    address: v.address.trim() || null,
    notes: v.notes.trim() || null,
    active: v.active,
  });
  return (
    <Modal open onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div><label className="label">Supplier name</label><input className="input" {...register('name')} />{errors.name && <p className="mt-1 text-xs text-danger-600">{errors.name.message}</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Contact person</label><input className="input" {...register('contact_person')} /></div>
          <div><label className="label">Phone</label><input className="input" {...register('phone')} />{errors.phone && <p className="mt-1 text-xs text-danger-600">{errors.phone.message}</p>}</div>
          <div className="sm:col-span-2"><label className="label">Email</label><input className="input" {...register('email')} />{errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}</div>
        </div>
        <div><label className="label">Address</label><input className="input" {...register('address')} /></div>
        <div><label className="label">Notes</label><textarea rows={2} className="input" {...register('notes')} /></div>
        <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" {...register('active')} /> Active</label>
        <button type="submit" className="btn-primary w-full py-2.5">Save supplier</button>
      </form>
    </Modal>
  );
}

const couponSchema = z.object({
  code: z.string().trim().min(3, 'At least 3 characters').max(20, 'At most 20 characters').regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - or _ only'),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number({ error: 'Enter a value' }).positive('Must be more than 0'),
  min_amount: z.number({ error: 'Enter an amount' }).min(0, 'Must be 0 or more'),
  max_discount: z.number({ error: 'Enter an amount' }).min(0, 'Must be 0 or more').nullable(),
  start_date: z.string().min(1, 'Choose a start date'),
  expiry_date: z.string().min(1, 'Choose an expiry date'),
  usage_limit: z.number({ error: 'Enter a number' }).int().min(1, 'Must be at least 1').nullable(),
  active: z.boolean(),
}).refine((v) => v.discount_type !== 'percentage' || v.discount_value <= 100, { message: 'Percentage cannot exceed 100', path: ['discount_value'] })
  .refine((v) => v.expiry_date >= v.start_date, { message: 'Expiry must be after start date', path: ['expiry_date'] });
type CouponForm = z.infer<typeof couponSchema>;

export function AdminCoupons() {
  const coupons = useDemoStore((s) => s.coupons);
  const upsert = useDemoStore((s) => s.upsertCoupon);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle="Discounts applied at checkout are validated against these rules"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Discount Coupons & Promotional Rules',
                subtitle: `Total Coupons: ${coupons.length} · Ammamas Marketing`,
                filename: `ammamas-coupons-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Coupon Code', key: 'code' },
                  { header: 'Discount Type', key: 'type', align: 'center' },
                  { header: 'Value', key: 'value', align: 'right' },
                  { header: 'Min Purchase', key: 'min_amount', align: 'right' },
                  { header: 'Max Discount', key: 'max_discount', align: 'right' },
                  { header: 'Valid Period', key: 'period' },
                  { header: 'Used Count', key: 'used_count', align: 'center' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: coupons.map((c) => ({
                  code: c.code,
                  type: c.discount_type.toUpperCase(),
                  value: c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`,
                  min_amount: c.min_amount > 0 ? `₹${c.min_amount}` : 'None',
                  max_discount: c.max_discount != null ? `₹${c.max_discount}` : 'No cap',
                  period: `${c.start_date} to ${c.expiry_date}`,
                  used_count: `${c.used_count}${c.usage_limit != null ? ` / ${c.usage_limit}` : ''}`,
                  status: c.active ? 'Active' : 'Inactive',
                })),
                summaryCards: [
                  { label: 'Total Coupons', value: String(coupons.length) },
                  { label: 'Active Codes', value: String(coupons.filter((c) => c.active).length) },
                  { label: 'Total Redemptions', value: String(coupons.reduce((n, c) => n + c.used_count, 0)) },
                ],
              }}
            />
            <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary">
              <Plus size={16} /> Add coupon
            </button>
          </div>
        }
      />
      {coupons.length === 0 ? <Empty message="No coupons yet." /> : (
        <div className="card divide-y divide-neutral-100">
          {coupons.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold tracking-wide text-neutral-800">{c.code}</p>
                <p className="text-xs text-neutral-400">
                  {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                  {c.min_amount > 0 && ` · min ₹${c.min_amount}`}
                  {c.max_discount != null && ` · max ₹${c.max_discount}`}
                  {` · ${c.start_date} to ${c.expiry_date}`}
                </p>
                <p className="text-xs text-neutral-400">Used {c.used_count}{c.usage_limit != null ? ` of ${c.usage_limit}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                <button onClick={() => { setEditing(c); setOpen(true); }} className="btn-ghost rounded-lg p-2" aria-label="Edit coupon"><Pencil size={16} /></button>
                <button onClick={() => { upsert({ ...c, active: !c.active }); toast.success(c.active ? 'Coupon deactivated' : 'Coupon activated'); }} className="btn-ghost rounded-lg p-2" aria-label="Toggle coupon"><Power size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <CouponModal
          key={editing?.id ?? 'new'}
          coupon={editing}
          onClose={() => setOpen(false)}
          onSave={(c) => { upsert(c); setOpen(false); toast.success('Coupon saved'); }}
        />
      )}
    </div>
  );
}

function CouponModal({ coupon, onClose, onSave }: { coupon: Coupon | null; onClose: () => void; onSave: (c: Coupon) => void }) {
  const coupons = useDemoStore((s) => s.coupons);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: coupon?.code ?? '', discount_type: coupon?.discount_type ?? 'fixed', discount_value: coupon?.discount_value ?? 50,
      min_amount: coupon?.min_amount ?? 0, max_discount: coupon?.max_discount ?? null,
      start_date: coupon?.start_date ?? new Date().toISOString().slice(0, 10),
      expiry_date: coupon?.expiry_date ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      usage_limit: coupon?.usage_limit ?? null, active: coupon?.active ?? true,
    },
  });
  const type = watch('discount_type');

  const submit = (v: CouponForm) => {
    const code = v.code.toUpperCase();
    if (coupons.some((c) => c.code === code && c.id !== coupon?.id)) {
      toast.error('A coupon with this code already exists');
      return;
    }
    onSave({
      id: coupon?.id ?? newId(),
      code,
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      min_amount: v.min_amount,
      max_discount: v.discount_type === 'percentage' ? v.max_discount : null,
      start_date: v.start_date,
      expiry_date: v.expiry_date,
      usage_limit: v.usage_limit,
      used_count: coupon?.used_count ?? 0,
      active: v.active,
    });
  };

  return (
    <Modal open onClose={onClose} title={coupon ? 'Edit coupon' : 'Add coupon'}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Coupon code</label><input className="input uppercase" {...register('code')} />{errors.code && <p className="mt-1 text-xs text-danger-600">{errors.code.message}</p>}</div>
        <div><label className="label">Discount type</label>
          <select className="input" {...register('discount_type')}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select>
        </div>
        <div><label className="label">{type === 'percentage' ? 'Percent off' : 'Amount off'}</label><input type="number" step="0.01" className="input" {...register('discount_value', { valueAsNumber: true })} />{errors.discount_value && <p className="mt-1 text-xs text-danger-600">{errors.discount_value.message}</p>}</div>
        <div><label className="label">Minimum bill</label><input type="number" step="0.01" className="input" {...register('min_amount', { valueAsNumber: true })} />{errors.min_amount && <p className="mt-1 text-xs text-danger-600">{errors.min_amount.message}</p>}</div>
        <div><label className="label">Maximum discount</label><input type="number" step="0.01" disabled={type !== 'percentage'} className="input disabled:bg-neutral-50" {...register('max_discount', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })} /></div>
        <div><label className="label">Start date</label><input type="date" className="input" {...register('start_date')} /></div>
        <div><label className="label">Expiry date</label><input type="date" className="input" {...register('expiry_date')} />{errors.expiry_date && <p className="mt-1 text-xs text-danger-600">{errors.expiry_date.message}</p>}</div>
        <div><label className="label">Usage limit (blank = unlimited)</label><input type="number" className="input" {...register('usage_limit', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })} />{errors.usage_limit && <p className="mt-1 text-xs text-danger-600">{errors.usage_limit.message}</p>}</div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-700"><input type="checkbox" {...register('active')} /> Active</label>
        {errors.discount_value && <p className="sm:col-span-2 text-xs text-danger-600">{errors.discount_value.message}</p>}
        <button type="submit" className="btn-primary sm:col-span-2 py-2.5">Save coupon</button>
      </form>
    </Modal>
  );
}
