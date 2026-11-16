import Link from "next/link";
import "./home.css";

export default function Home() {
  return (
    <main className="hm">
      <div>
        <h1 className="hm-brand">QReader</h1>
        <p className="hm-line">Scan the code. Get buzzed when your order is ready.</p>
      </div>

      <nav className="hm-links" aria-label="QReader">
        <Link href="/dashboard" className="hm-link" data-primary="true">
          Dashboard <small>Orders &amp; setup</small>
        </Link>
        <Link href="/kitchen" className="hm-link">
          Kitchen screen <small>Staff</small>
        </Link>
        <Link href="/login" className="hm-link">
          Sign in <small>or create a store</small>
        </Link>
      </nav>
    </main>
  );
}
