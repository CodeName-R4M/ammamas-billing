import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import toast from 'react-hot-toast';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadResult {
  url: string;
  source: 'supabase' | 'local';
}

/**
 * Uploads an image to Supabase Storage ('catalog' bucket) under the given folder.
 * If Supabase is not connected or upload fails, falls back gracefully to a Base64 data URL.
 */
export async function uploadImageToStorage(
  file: File,
  folder: 'categories' | 'products' = 'categories',
): Promise<UploadResult> {
  // Validate type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Unsupported format. Please upload JPG, PNG, WebP, GIF, or SVG.');
  }

  // Validate size
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image too large. Maximum file size is 5 MB.');
  }

  // If Supabase client is configured, attempt upload to 'catalog' bucket
  if (isSupabaseConfigured && supabase) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 32);
      const filePath = `${folder}/${Date.now()}_${cleanName}.${ext}`;

      const { data, error } = await supabase.storage
        .from('catalog')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from('catalog')
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          return {
            url: publicUrlData.publicUrl,
            source: 'supabase',
          };
        }
      } else if (error) {
        console.warn('Supabase storage upload error:', error.message);
      }
    } catch (err) {
      console.warn('Supabase storage upload failed, falling back to local data URL:', err);
    }
  }

  // Fallback to Base64 data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  return {
    url: dataUrl,
    source: 'local',
  };
}

/**
 * Checks if a string is a valid web URL or Data URL.
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/')
  );
}
