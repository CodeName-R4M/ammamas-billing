import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/auth-store';
import { Watermark } from '@/components/watermark/Watermark';
import { isSupabaseConfigured } from '@/lib/supabase';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export function Login() {
  const nav = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      // The role is decided by the staff profile stored in the cloud, never by this form.
      const res = await signIn(data.email, data.password);
      if (!res.ok || !res.user) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      nav(res.user.role === 'admin' ? '/admin' : '/pos', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-accent-50 to-primary-50 px-4 safe-top safe-bottom">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-full sm:max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-16 w-20 place-items-center rounded-2xl bg-white p-1.5 shadow-md border border-neutral-100">
            <img src="/logo-red.png" alt="Ammamas" className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Ammamas</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Billing &amp; Inventory</p>
          </div>
        </div>

        <div className="card p-6">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700">
              Offline mode — the cloud server is not configured. Items are stored only on this device.
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" placeholder="you@alpha.in" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  className="input pr-11"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-neutral-400">
            Staff sign in with the account issued by an administrator.
          </p>
        </div>
        <Watermark />
      </motion.div>
    </div>
  );
}
