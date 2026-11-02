import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Pencil, Power, Search, ImagePlus, X, Link as LinkIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { formatCurrency, newId } from '@/lib/calculations';
import { uploadImageToStorage, isValidImageUrl } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ExportButton } from '@/components/common/ExportButton';
import type { Product } from '@/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().trim().min(1, 'SKU is required'),
  category_id: z.string().min(1, 'Choose a category'),
  description: z.string(),
  unit: z.string().trim().min(1, 'Unit is required'),
  selling_price: z.number({ error: 'Enter a price' }).min(0, 'Must be 0 or more'),
  cost_price: z.number({ error: 'Enter a cost' }).min(0, 'Must be 0 or more'),
  opening_stock: z.number({ error: 'Enter a number' }).min(0, 'Must be 0 or more'),
  low_stock_threshold: z.number({ error: 'Enter a number' }).min(0, 'Must be 0 or more'),
  expiry_date: z.string(),
  batch_number: z.string(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function AdminProducts() {
  const location = useLocation();
  const initialCategory = (location.state as { category?: string } | null)?.category ?? 'all';
  const products = useDemoStore((s) => s.products);
  const categories = useDemoStore((s) => s.categories);
  const upsert = useDemoStore((s) => s.upsertProduct);
  const currency = useDemoStore((s) => s.settings.currency);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState(initialCategory);
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unassigned';

  const list = useMemo(() => products.filter((p) => {
    if (catFilter !== 'all' && p.category_id !== catFilter) return false;
    if (stockFilter === 'low' && !(p.stock <= p.low_stock_threshold)) return false;
    if (stockFilter === 'out' && p.stock > 0) return false;
    if (q.trim()) {
      const needle = q.toLowerCase();
      return p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle);
    }
    return true;
  }), [products, q, catFilter, stockFilter]);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setOpen(true); };

  const toggleActive = (p: Product) => {
    const next = { ...p, active: !p.active };
    upsert(next);
    if (isSupabaseConfigured && supabase) {
      supabase
        .from('products')
        .update({ active: next.active })
        .eq('id', p.id)
        .then(({ error }) => {
          if (error) toast.error(`Cloud update failed: ${error.message}`);
        });
    }
    toast.success(p.active ? `${p.name} deactivated` : `${p.name} activated`);
  };

  const handleSaveProduct = async (p: Product) => {
    upsert(p);
    setOpen(false);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('products').upsert({
          id: p.id,
          category_id: p.category_id,
          name: p.name,
          sku: p.sku,
          description: p.description,
          image_url: p.image_url,
          selling_price: p.selling_price,
          cost_price: p.cost_price,
          unit: p.unit,
          stock: p.stock,
          low_stock_threshold: p.low_stock_threshold,
          expiry_date: p.expiry_date,
          batch_number: p.batch_number,
          active: p.active,
        });
        if (error) {
          toast.error(`Saved on this device only — cloud save failed: ${error.message}`);
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Saved on this device only — cloud save failed: ${msg}`);
        return;
      }
    }

    toast.success(editing ? 'Product updated' : 'Product created');
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} products in catalog`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Products Catalog Master Report',
                subtitle: `Total Products: ${list.length} displayed · Ammamas Inventory`,
                filename: `ammamas-products-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'SKU', key: 'sku' },
                  { header: 'Product Name', key: 'name' },
                  { header: 'Category', key: 'category' },
                  { header: 'Selling Price', key: 'price_fmt', align: 'right' },
                  { header: 'Cost Price', key: 'cost_fmt', align: 'right' },
                  { header: 'Stock', key: 'stock', align: 'right' },
                  { header: 'Unit', key: 'unit', align: 'center' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: list.map((p) => ({
                  sku: p.sku,
                  name: p.name,
                  category: catName(p.category_id),
                  price_fmt: formatCurrency(p.selling_price, currency),
                  cost_fmt: formatCurrency(p.cost_price, currency),
                  stock: p.stock,
                  unit: p.unit,
                  status: p.active ? 'Active' : 'Inactive',
                })),
                summaryCards: [
                  { label: 'Total Products', value: String(list.length) },
                  { label: 'Active', value: String(list.filter((p) => p.active).length) },
                  { label: 'Low Stock', value: String(list.filter((p) => p.stock <= p.low_stock_threshold).length) },
                  { label: 'Out of Stock', value: String(list.filter((p) => p.stock <= 0).length) },
                ],
              }}
            />
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} /> Add product
            </button>
          </div>
        }
      />

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input className="input pl-9" placeholder="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'out')}>
          <option value="all">All stock levels</option>
          <option value="low">Low or out of stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      {list.length === 0 ? <Empty message="No products match these filters." /> : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 md:grid">
            <span>Product</span><span>Category</span><span>Price</span><span>Cost</span><span>Stock</span><span />
          </div>
          {list.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
              <div className="flex min-w-0 items-center gap-3">
                <ProductThumb product={p} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-800">{p.name}</p>
                  <p className="text-xs text-neutral-400">{p.sku} · {p.unit}</p>
                </div>
              </div>
              <div className="hidden text-sm text-neutral-600 md:block">{catName(p.category_id)}</div>
              <div className="hidden text-sm font-medium text-neutral-800 md:block">{formatCurrency(p.selling_price, currency)}</div>
              <div className="hidden text-sm text-neutral-500 md:block">{formatCurrency(p.cost_price, currency)}</div>
              <div className="hidden md:block">
                <StockBadge stock={p.stock} threshold={p.low_stock_threshold} />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(p)} className="btn-ghost rounded-lg p-2" aria-label="Edit product"><Pencil size={16} /></button>
                <button onClick={() => toggleActive(p)} className={`btn-ghost rounded-lg p-2 ${p.active ? 'text-warning-600' : 'text-success-600'}`} aria-label={p.active ? 'Deactivate' : 'Activate'}><Power size={16} /></button>
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-2 md:hidden">
                <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                <StockBadge stock={p.stock} threshold={p.low_stock_threshold} />
                <span className="text-xs text-neutral-500">{catName(p.category_id)} · {formatCurrency(p.selling_price, currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ProductModal
          key={editing?.id ?? 'new'}
          product={editing}
          onClose={() => setOpen(false)}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.image_url) {
    return <img src={product.image_url} alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />;
  }
  return <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-400">{product.name.slice(0, 2).toUpperCase()}</div>;
}

function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (stock <= threshold) return <Badge tone="warning">Low · {stock}</Badge>;
  return <Badge tone="success">{stock} in stock</Badge>;
}

function ProductModal({ product, onClose, onSave }: { product: Product | null; onClose: () => void; onSave: (p: Product) => void }) {
  const categories = useDemoStore((s) => s.categories);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      category_id: product?.category_id ?? categories[0]?.id ?? '',
      description: product?.description ?? '',
      unit: product?.unit ?? '',
      selling_price: product?.selling_price ?? 0,
      cost_price: product?.cost_price ?? 0,
      opening_stock: 0,
      low_stock_threshold: product?.low_stock_threshold ?? 5,
      expiry_date: product?.expiry_date ?? '',
      batch_number: product?.batch_number ?? '',
      active: product?.active ?? true,
    },
  });

  const [uploadingImg, setUploadingImg] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadingImg(true);
    try {
      const res = await uploadImageToStorage(file, 'products');
      setImageUrl(res.url);
      if (res.source === 'supabase') {
        toast.success('Product image uploaded to Supabase!');
      } else {
        toast.success('Image loaded locally');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImg(false);
    }
  };

  const applyLink = () => {
    if (!linkInput.trim()) return;
    if (!isValidImageUrl(linkInput)) {
      toast.error('Enter a valid image URL starting with http:// or https://');
      return;
    }
    setImageUrl(linkInput.trim());
    setShowUrlField(false);
    setLinkInput('');
    toast.success('Image link set');
  };

  const submit = (v: FormValues) => {
    onSave({
      id: product?.id ?? newId(),
      name: v.name.trim(),
      sku: v.sku.trim(),
      category_id: v.category_id,
      description: v.description.trim() || null,
      image_url: imageUrl,
      selling_price: v.selling_price,
      cost_price: v.cost_price,
      unit: v.unit.trim(),
      stock: product ? product.stock : v.opening_stock,
      low_stock_threshold: v.low_stock_threshold,
      expiry_date: v.expiry_date || null,
      batch_number: v.batch_number.trim() || null,
      active: v.active,
    });
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit product' : 'Add product'}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Product preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-primary-300">
                  <ImagePlus size={22} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-secondary cursor-pointer py-1.5 text-xs">
                {uploadingImg ? 'Uploading...' : 'Upload file'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  disabled={uploadingImg}
                  onChange={(e) => onImage(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowUrlField((v) => !v)}
                className="btn-secondary py-1.5 text-xs"
              >
                <LinkIcon size={13} className="mr-1 inline" /> Image URL
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="btn-ghost py-1.5 text-xs text-danger-600 hover:text-danger-700"
                >
                  <X size={13} className="mr-1 inline" /> Remove
                </button>
              )}
            </div>
          </div>
          {showUrlField && (
            <div className="mt-2 flex gap-2">
              <input
                className="input text-xs"
                placeholder="https://example.com/product.jpg"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
              />
              <button
                type="button"
                onClick={applyLink}
                className="btn-secondary whitespace-nowrap text-xs"
              >
                Apply
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}><input className="input" {...register('name')} /></Field>
          <Field label="SKU" error={errors.sku?.message}><input className="input" {...register('sku')} /></Field>
          <Field label="Category" error={errors.category_id?.message}>
            <select className="input" {...register('category_id')}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Unit / pack size" error={errors.unit?.message}><input className="input" placeholder="250g" {...register('unit')} /></Field>
          <Field label="Selling price" error={errors.selling_price?.message}><input type="number" step="0.01" className="input" {...register('selling_price', { valueAsNumber: true })} /></Field>
          <Field label="Cost price" error={errors.cost_price?.message}><input type="number" step="0.01" className="input" {...register('cost_price', { valueAsNumber: true })} /></Field>
          {!product && (
            <Field label="Opening stock" error={errors.opening_stock?.message}><input type="number" step="1" className="input" {...register('opening_stock', { valueAsNumber: true })} /></Field>
          )}
          <Field label="Low-stock threshold" error={errors.low_stock_threshold?.message}><input type="number" step="1" className="input" {...register('low_stock_threshold', { valueAsNumber: true })} /></Field>
          <Field label="Expiry date"><input type="date" className="input" {...register('expiry_date')} /></Field>
          <Field label="Batch number"><input className="input" {...register('batch_number')} /></Field>
        </div>
        {product && (
          <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">Current stock is {product.stock}. Change stock from the Inventory page so every change is recorded.</p>
        )}
        <Field label="Description"><textarea rows={2} className="input" {...register('description')} /></Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" {...register('active')} /> Active (visible to cashiers)</label>
        <button type="submit" className="btn-primary w-full py-2.5">{product ? 'Save changes' : 'Create product'}</button>
      </form>
    </Modal>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
