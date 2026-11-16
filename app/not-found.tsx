import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100 mb-4">404</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-6">
          Halaman tidak ditemukan
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}