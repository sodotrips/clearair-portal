'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (session) {
      // Redirect based on role
      const role = (session.user as any)?.role;
      if (role === 'Tech') {
        router.push('/tech');
      } else {
        router.push('/dashboard');
      }
    } else {
      router.push('/login');
    }
  }, [session, status, router]);

  return (
    <div className="min-h-screen bg-[#0a2540] flex items-center justify-center">
      <div className="text-center">
        <div className="bg-white rounded-2xl p-3 mx-auto mb-4 inline-block">
          <Image
            src="/clearair-logo.png"
            alt="ClearAir Solutions"
            width={120}
            height={36}
            priority
          />
        </div>
        <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-400 mt-4">Loading...</p>
      </div>
    </div>
  );
}
