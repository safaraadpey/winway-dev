'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-gray-100" style={{ maxWidth: '390px', margin: '0 auto', width: '100%' }}>
          <div className="text-center p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">خطای سیستمی!</h2>
            <p className="text-gray-600 mb-6">{error.message || 'یک خطای جدی رخ داد'}</p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              تلاش مجدد
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
