'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100" style={{ maxWidth: '390px', margin: '0 auto', width: '100%' }}>
      <div className="text-center p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">خطایی رخ داد!</h2>
        <p className="text-gray-600 mb-6">{error.message || 'یک خطای غیرمنتظره رخ داد'}</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          تلاش مجدد
        </button>
      </div>
    </div>
  );
}
