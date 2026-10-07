import Link from "next/link";

import RecipeEditor from "@/components/RecipeEditor";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-dvh bg-[#fbfaf6] px-5 py-8 text-[#24342b] sm:px-8 lg:px-10 lg:py-16">
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
            Edit recipe
          </h1>
        </header>
        <div className="rounded-2xl border border-[#ded9cf] bg-white p-5 shadow-[0_18px_50px_rgba(42,48,38,0.08)] sm:p-7">
          <RecipeEditor recipeId={id} />
        </div>
      </div>
    </main>
  );
}
