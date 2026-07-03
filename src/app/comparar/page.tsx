import { Comparador } from "@/components/comparador";
import { Wordmark } from "@/components/brand";

export const metadata = { title: "i10 Gov 360 — Comparador de municípios" };

export default function CompararPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark subtitle="Comparador de municípios" />
      </div>
      <Comparador />
    </main>
  );
}
