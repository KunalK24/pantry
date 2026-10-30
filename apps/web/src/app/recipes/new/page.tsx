import Link from "next/link";

import RecipeForm from "@/components/RecipeForm";
import SignedInShell from "@/components/SignedInShell";

export default function NewRecipePage() {
  return (
    <SignedInShell activeSection="recipes">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <Link
            className="inline-flex rounded-lg text-sm font-bold text-[#35644f] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            href="/recipes"
          >
            Back to recipe book
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c5745a]">
            Your collection
          </p>
          <h1 className="mt-3 [font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
            New recipe
          </h1>
        </header>
        <div className="rounded-2xl border border-[#ded9cf] bg-white p-5 shadow-[0_18px_50px_rgba(42,48,38,0.08)] sm:p-7">
          <RecipeForm />
        </div>
      </div>
    </SignedInShell>
  );
}
