import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-gray-700 dark:text-gray-300">
          Page Not Found
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go back home
          </Link>
        </div>
      </div>
    </div>
  );
}