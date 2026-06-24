import Link from "next/link";
import Head from "next/head";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found · e-Prescription</title>
      </Head>
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-white font-mono text-lg font-bold">
          ℞
        </span>
        <p className="eyebrow mt-6">Error 404</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">Page not found</h1>
        <p className="text-muted mt-3 max-w-sm">
          That route does not exist. Head back and pick a role to continue.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-11 items-center rounded-lg bg-teal px-5 text-white font-medium hover:bg-teal-deep transition-colors"
        >
          Back to home
        </Link>
      </div>
    </>
  );
}
