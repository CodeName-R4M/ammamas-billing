import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Pencil,
  FolderOpen,
  Power,
  Upload,
  Link as LinkIcon,
  X,
  Image as ImageIcon,
  CheckCircle2,
  Sparkles,
  CloudUpload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDemoStore } from '@/stores/demo-store';
import { PageHeader, Badge, Modal, Empty } from '@/components/ui/admin';
import { newId } from '@/lib/calculations';
import { uploadImageToStorage, isValidImageUrl } from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ExportButton } from '@/components/common/ExportButton';
import type { Category } from '@/types';

const CATEGORY_IMAGE_PRESETS = [
  {
    label: 'Snacks & Namkeen',
    url: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Pickles',
    url: 'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Spices & Masalas',
    url: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Ghee & Oils',
    url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Traditional Sweets',
    url: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Fryums & Papads',
    url: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Beverages & Tea',
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80',
  },
  {
    label: 'Bakery & Biscuits',
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
  },
];

export function AdminCategories() {
  const categories = useDemoStore((s) => s.categories);
  const products = useDemoStore((s) => s.products);
  const upsert = useDemoStore((s) => s.upsertCategory);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const startNew = () => {
    setEditing({
      id: newId(),
      name: '',
      description: '',
      image_url: null,
      display_order: categories.length + 1,
      active: true,
    });
    setOpen(true);
  };

  const count = (catId: string) => products.filter((p) => p.category_id === catId).length;

  const toggle = (c: Category) => {
    const updated = { ...c, active: !c.active };
    upsert(updated);
    if (isSupabaseConfigured && supabase) {
      supabase
        .from('categories')
        .update({ active: updated.active })
        .eq('id', c.id)
        .then(({ error }) => {
          if (error) toast.error(`Cloud update failed: ${error.message}`);
        });
    }
    toast.success(c.active ? 'Category deactivated' : 'Category activated');
  };

  const handleSave = async (c: Category) => {
    upsert(c);
    setOpen(false);

    // Sync to Supabase in background if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('categories').upsert({
          id: c.id,
          name: c.name,
          description: c.description,
          image_url: c.image_url,
          display_order: c.display_order,
          active: c.active,
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

    toast.success('Category saved successfully');
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Manage product categories and category cover photos for cashier view"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton
              options={{
                title: 'Product Categories Master Directory',
                subtitle: `Total Categories: ${categories.length} · Ammamas Catalog`,
                filename: `ammamas-categories-${new Date().toISOString().slice(0, 10)}`,
                columns: [
                  { header: 'Display Order', key: 'order', align: 'center' },
                  { header: 'Category Name', key: 'name' },
                  { header: 'Description', key: 'description' },
                  { header: 'Products Count', key: 'count', align: 'right' },
                  { header: 'Status', key: 'status', align: 'center' },
                ],
                data: categories.map((c) => ({
                  order: c.display_order,
                  name: c.name,
                  description: c.description || '—',
                  count: count(c.id),
                  status: c.active ? 'Active' : 'Inactive',
                })),
                summaryCards: [
                  { label: 'Total Categories', value: String(categories.length) },
                  { label: 'Active', value: String(categories.filter((c) => c.active).length) },
                  { label: 'Total Products in Catalog', value: String(products.length) },
                ],
              }}
            />
            <button onClick={startNew} className="btn-primary">
              <Plus size={16} /> Add category
            </button>
          </div>
        }
      />

      {categories.length === 0 ? (
        <Empty message="No categories yet. Click 'Add category' to create your first one." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="card overflow-hidden p-4 transition-shadow hover:shadow-card-hover">
              {/* Category Cover Image */}
              <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-50 to-primary-100">
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-primary-300">
                    <span className="text-3xl font-bold">{c.name[0] || 'C'}</span>
                    <span className="text-[10px] text-neutral-400">No cover image</span>
                  </div>
                )}
                {c.image_url && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    Cover set
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-neutral-800">{c.name}</p>
                  {c.description && (
                    <p className="line-clamp-1 text-xs text-neutral-500">{c.description}</p>
                  )}
                  <p className="mt-1 text-xs text-neutral-400">
                    {count(c.id)} products · order {c.display_order}
                  </p>
                </div>
                <Badge tone={c.active ? 'success' : 'neutral'}>
                  {c.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditing(c);
                    setOpen(true);
                  }}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  <Pencil size={14} /> Edit
                </button>
                <Link
                  to="/admin/products"
                  state={{ category: c.id }}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  <FolderOpen size={14} /> Products
                </Link>
                <button
                  onClick={() => toggle(c)}
                  className={`btn px-3 py-2 text-xs ${c.active ? 'text-warning-600' : 'text-success-600'}`}
                  aria-label="Toggle active status"
                  title={c.active ? 'Deactivate' : 'Activate'}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CategoryModal
        key={editing?.id ?? 'new'}
        open={open}
        onClose={() => setOpen(false)}
        category={editing}
        onSave={handleSave}
      />
    </div>
  );
}

function CategoryModal({
  open,
  onClose,
  category,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  category: Category | null;
  onSave: (c: Category) => void;
}) {
  const [form, setForm] = useState<Category | null>(category);
  const [activeTab, setActiveTab] = useState<'upload' | 'link' | 'presets'>('upload');
  const [urlInput, setUrlInput] = useState(category?.image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open || !form) return null;

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImageToStorage(file, 'categories');
      setForm((prev) => (prev ? { ...prev, image_url: result.url } : null));
      setUrlInput(result.url);
      if (result.source === 'supabase') {
        toast.success('Image uploaded to Supabase Storage!');
      } else {
        toast.success('Image saved locally (Demo mode)');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyUrl = () => {
    if (!urlInput.trim()) {
      setForm((prev) => (prev ? { ...prev, image_url: null } : null));
      return;
    }
    if (!isValidImageUrl(urlInput)) {
      toast.error('Please enter a valid image URL starting with http:// or https://');
      return;
    }
    setForm((prev) => (prev ? { ...prev, image_url: urlInput.trim() } : null));
    toast.success('Image URL linked');
  };

  const removeImage = () => {
    setForm((prev) => (prev ? { ...prev, image_url: null } : null));
    setUrlInput('');
    toast.success('Image removed');
  };

  return (
    <Modal open={open} onClose={onClose} title={categoriesTitle(category)}>
      <div className="space-y-4">
        {/* Basic Info */}
        <div>
          <label className="label">Category Name</label>
          <input
            className="input"
            placeholder="e.g. Snacks, Pickles, Spice Powders"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Description (Optional)</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Short summary displayed under the category name"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Image Management Section */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Category Cover Image
            </label>
            {form.image_url && (
              <button
                type="button"
                onClick={removeImage}
                className="flex items-center gap-1 text-xs text-danger-600 hover:text-danger-700"
              >
                <X size={13} /> Remove
              </button>
            )}
          </div>

          {/* Current Image Preview & Cashier Look */}
          <div className="mb-3 flex items-center gap-3">
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              {form.image_url ? (
                <img
                  src={form.image_url}
                  alt="Category preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-primary-50 text-primary-400">
                  <ImageIcon size={22} />
                  <span className="text-[10px] text-neutral-400">No cover</span>
                </div>
              )}
            </div>
            <div className="text-xs text-neutral-500">
              <p className="font-medium text-neutral-700">Cashier Preview</p>
              <p className="text-[11px] text-neutral-400">
                Cashiers will see this cover picture on the POS category selection screen.
              </p>
              {form.image_url && (
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-success-50 px-1.5 py-0.5 text-[10px] font-medium text-success-700">
                  <CheckCircle2 size={11} /> Image ready
                </span>
              )}
            </div>
          </div>

          {/* Source Tabs */}
          <div className="mb-3 flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                activeTab === 'upload'
                  ? 'bg-primary-50 text-primary-700 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Upload size={13} className="mr-1 inline" /> Upload File
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('link')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                activeTab === 'link'
                  ? 'bg-primary-50 text-primary-700 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <LinkIcon size={13} className="mr-1 inline" /> Image Link
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                activeTab === 'presets'
                  ? 'bg-primary-50 text-primary-700 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Sparkles size={13} className="mr-1 inline" /> Presets
            </button>
          </div>

          {/* Tab 1: Upload File */}
          {activeTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-primary-300 bg-white p-4 transition hover:bg-primary-50/50"
              >
                {uploading ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-primary-600">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600/30 border-t-primary-600" />
                    Uploading image to Supabase Storage...
                  </div>
                ) : (
                  <>
                    <CloudUpload size={24} className="mb-1 text-primary-500" />
                    <span className="text-xs font-semibold text-neutral-700">
                      Click to upload cover image
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      PNG, JPG, WebP, SVG up to 5 MB (stored in Supabase catalog bucket)
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Tab 2: Image Link */}
          {activeTab === 'link' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className="input text-xs"
                  placeholder="https://example.com/image.jpg"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={applyUrl}
                  className="btn-secondary whitespace-nowrap text-xs"
                >
                  Apply
                </button>
              </div>
              <p className="text-[10px] text-neutral-400">
                Paste any public image link from Unsplash, Imgur, or your website.
              </p>
            </div>
          )}

          {/* Tab 3: Presets */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_IMAGE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, image_url: preset.url });
                    setUrlInput(preset.url);
                    toast.success(`Applied ${preset.label} cover photo`);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-left transition hover:border-primary-400 hover:bg-primary-50/30"
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    className="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                  <span className="line-clamp-1 text-xs font-medium text-neutral-700">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Display Order & Active Toggle */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Display order</label>
            <input
              type="number"
              className="input"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active in POS
            </label>
          </div>
        </div>

        <button
          onClick={() => (form.name.trim() ? onSave(form) : toast.error('Name required'))}
          className="btn-primary w-full py-2.5"
        >
          Save category
        </button>
      </div>
    </Modal>
  );
}

function categoriesTitle(c: Category | null) {
  return c && c.name ? 'Edit category' : 'Add category';
}
