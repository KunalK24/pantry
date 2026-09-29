import Link from "next/link";
import PantryLibrary from "@/components/PantryLibrary";

export default function PantryPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Pantry
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Keep track of ingredients you have available.
          </p>
        </div>
        <Link
          className="bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:outline-emerald-400"
          href="/pantry/new"
        >
          Add pantry item
        </Link>
      </div>
      <PantryLibrary />
    </main>
  );
}
