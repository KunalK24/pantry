import RecipeLibrary from "@/components/RecipeLibrary";

export default function RecipesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Recipe library
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select a recipe to view or edit it.
        </p>
      </div>
      <RecipeLibrary />
    </main>
  );
}
