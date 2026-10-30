import RecipeDetail from "@/components/RecipeDetail";
import SignedInShell from "@/components/SignedInShell";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <SignedInShell activeSection="recipes">
      <RecipeDetail recipeId={id} />
    </SignedInShell>
  );
}
