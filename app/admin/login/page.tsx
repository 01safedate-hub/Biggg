'use client';

export const dynamic = 'force-dynamic';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import getBrowserSupabase from '@/lib/supabase/client';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getBrowserSupabase();

  const redirectError = searchParams.get('error');
  const initialError =
    redirectError === 'session'
      ? 'Your session has expired. Please sign in again.'
      : redirectError === 'unauthorized'
        ? 'Admin access required.'
        : null;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!signInData.user) {
        throw new Error('Sign-in succeeded but no user was returned.');
      }

      // Verify admin role before attempting to enter the protected area
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
      if (adminError) throw adminError;
      if (!isAdmin) {
        await supabase.auth.signOut();
        throw new Error('This account does not have admin access.');
      }

      router.replace('/admin');
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F4F0]">
      <form onSubmit={signIn} className="w-[420px] p-8 rounded-lg" style={{background: 'white', border: '1px solid var(--line)'}}>
        <h2 className="text-[18px] font-semibold mb-1">Admin sign in</h2>
        <p className="text-[12px] mb-4" style={{color: 'var(--gray)'}}>Use your admin credentials to access the console</p>

        <label className="block text-[12px] mb-2">Email</label>
        <input className="w-full mb-3 px-3 py-2 rounded-md border" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="block text-[12px] mb-2">Password</label>
        <input type="password" className="w-full mb-4 px-3 py-2 rounded-md border" value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="text-red-600 text-[13px] mb-3">{error}</div>}
        {!error && initialError && <div className="text-red-600 text-[13px] mb-3">{initialError}</div>}

        <button disabled={loading} className="w-full py-2 rounded-md font-semibold" style={{background: 'var(--orange)', color: 'white'}}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
