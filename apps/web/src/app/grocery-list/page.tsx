import GroceryList from "@/components/GroceryList";

export default function GroceryListPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Grocery list
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Build a shopping list from recipes and pantry items that are running low.
        </p>
      </div>
      <GroceryList />
    </main>
  );
}
