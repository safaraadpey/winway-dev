import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100" style={{ maxWidth: '390px', margin: '0 auto', width: '100%' }}>
      <div className="text-center p-6">
        <h2 className="text-4xl font-bold text-gray-800 mb-4">404</h2>
        <p className="text-xl text-gray-600 mb-6">صفحه مورد نظر یافت نشد</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          بازگشت به صفحه اصلی
        </Link>
      </div>
    </div>
  );
}
