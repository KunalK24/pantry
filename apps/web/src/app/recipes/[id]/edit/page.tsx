import RecipeEditor from "@/components/RecipeEditor";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <RecipeEditor recipeId={id} />
    </main>
  );
}
