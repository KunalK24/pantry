import RecipeLibrary from "@/components/RecipeLibrary";
import SignedInShell from "@/components/SignedInShell";

export default function RecipesPage() {
  return (
    <SignedInShell activeSection="recipes">
      <RecipeLibrary />
    </SignedInShell>
  );
}
