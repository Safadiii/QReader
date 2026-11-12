import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-medium">QReader</h1>
      <Link
        href="/dashboard"
        className="rounded-full border border-white/20 px-5 py-2 text-sm hover:border-white/50"
      >
        Open the dashboard
      </Link>
      <Link
        href="/display"
        className="rounded-full border border-white/20 px-5 py-2 text-sm hover:border-white/50"
      >
        Open the customer screen
      </Link>
      <Link
        href="/kitchen"
        className="rounded-full border border-white/20 px-5 py-2 text-sm hover:border-white/50"
      >
        Open the kitchen screen
      </Link>
    </main>
  );
}
