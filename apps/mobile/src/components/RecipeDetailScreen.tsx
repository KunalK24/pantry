import { Link, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, deleteJson, getJson, patchJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import RecipeCover from "@/components/RecipeCover";
import { formatMealType, isRecipeDetail, isSafeRecipeId, type RecipeDetail } from "@/recipes/recipe";

export default function RecipeDetailScreen({ id, session }: { id: string; session: Session }) {
  const { clearSession } = useAuth();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const favoritePendingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const invalidId = !isSafeRecipeId(id);

  useEffect(() => {
    if (invalidId) return;

    let active = true;
    getJson(`/api/recipes/${encodeURIComponent(id)}`, isRecipeDetail, session.token).then(
      (result) => {
        if (!active) return;
        setRecipe(result);
        setError(null);
        setMissing(false);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setRecipe(null);
        if (caught instanceof ApiError && caught.status === 401) {
          clearSession();
          return;
        }
        const notFound = caught instanceof ApiError && caught.status === 404;
        setError(notFound ? "Recipe not found." : caught instanceof Error ? caught.message : "Unable to load this recipe.");
        setMissing(notFound);
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, id, invalidId, retryCount, session.token]);

  function retry() {
    setRecipe(null);
    setError(null);
    setLoading(true);
    setRetryCount((current) => current + 1);
  }

  async function toggleFavorite() {
    if (!recipe || favoritePendingRef.current || deletingRef.current) return;
    favoritePendingRef.current = true;
    setFavoritePending(true);
    setFavoriteError(null);
    try {
      const updated = await patchJson(
        `/api/recipes/${encodeURIComponent(recipe.id)}`,
        { isFavorite: !recipe.isFavorite },
        isRecipeDetail,
        session.token,
      );
      setRecipe(updated);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 404) {
        setRecipe(null);
        setMissing(true);
        setError("Recipe not found.");
      } else {
        setFavoriteError(caught instanceof Error ? caught.message : "Unable to update favorite.");
      }
    } finally {
      favoritePendingRef.current = false;
      setFavoritePending(false);
    }
  }

  async function deleteCurrentRecipe(recipeToDelete: RecipeDetail) {
    if (deletingRef.current || favoritePendingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteJson(`/api/recipes/${encodeURIComponent(recipeToDelete.id)}`, isRecipeDetail, session.token);
      router.dismissTo("/recipes");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 404) {
        router.dismissTo("/recipes");
      } else {
        setDeleteError(caught instanceof Error ? caught.message : "Unable to delete this recipe.");
      }
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  function confirmDelete() {
    if (!recipe || deletingRef.current || favoritePendingRef.current) return;
    const recipeToDelete = recipe;
    Alert.alert("Delete recipe?", `Delete ${recipe.name}? This also removes it from meal plans and grocery list recipe selections.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void deleteCurrentRecipe(recipeToDelete); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Link href="/recipes" asChild>
          <Pressable accessibilityRole="button" style={styles.back}><Text style={styles.backText}>← Recipes</Text></Pressable>
        </Link>
        {!invalidId && loading ? <ActivityIndicator accessibilityLabel="Loading recipe" color="#35644f" style={styles.loader} /> : null}
        {(invalidId || error) ? (
          <View style={styles.message}>
            <Text accessibilityRole="alert" style={styles.error}>{invalidId ? "Recipe not found." : error}</Text>
            {!invalidId && !missing ? (
              <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!invalidId && recipe ? (
          <View style={styles.body}>
            <RecipeCover recipe={recipe} token={session.token} large />
            <Text style={styles.title}>{recipe.name}</Text>
            {!deleting ? <Link href={{ pathname: "/recipes/edit/[id]", params: { id: recipe.id } }} asChild>
              <Pressable accessibilityRole="button" style={styles.editButton}><Text style={styles.editText}>Edit recipe</Text></Pressable>
            </Link> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={recipe.isFavorite ? "Remove from favorites" : "Add to favorites"}
              accessibilityState={{ selected: recipe.isFavorite, disabled: favoritePending || deleting }} disabled={favoritePending || deleting}
              onPress={() => void toggleFavorite()} style={styles.favoriteButton}>
              <Text style={styles.favoriteText}>{favoritePending ? "Saving…" : recipe.isFavorite ? "♥ Favorite" : "♡ Add to favorites"}</Text>
            </Pressable>
            {favoriteError ? <Text accessibilityRole="alert" style={styles.error}>{favoriteError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Delete recipe" disabled={deleting || favoritePending}
              onPress={confirmDelete} style={styles.deleteButton}>
              <Text style={styles.deleteText}>{deleting ? "Deleting…" : "Delete recipe"}</Text>
            </Pressable>
            {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
            <Text style={styles.meta}>{[
              formatMealType(recipe.mealType),
              recipe.timeMinutes ? `${recipe.timeMinutes} min` : null,
              recipe.isFavorite ? "Favorite" : null,
            ].filter(Boolean).join(" · ")}</Text>
            {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
            <Text style={styles.heading}>Ingredients</Text>
            {recipe.ingredients.map((ingredient, index) => (
              <Text key={`${index}-${ingredient.name}`} style={styles.line}>
                • {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}
              </Text>
            ))}
            <Text style={styles.heading}>Instructions</Text>
            {recipe.instructions.map((step, index) => (
              <Text key={index} style={styles.line}>{index + 1}. {step}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { flexGrow: 1, gap: 14, padding: 24 },
  back: { alignSelf: "flex-start", paddingVertical: 6 },
  backText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  loader: { marginTop: 24 },
  message: { alignItems: "flex-start", gap: 12 },
  error: { color: "#a12f2f", fontSize: 16, lineHeight: 22 },
  retry: { borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: "#35644f", fontSize: 15, fontWeight: "600" },
  body: { gap: 12 },
  title: { color: "#244c38", fontSize: 30, fontWeight: "700" },
  editButton: { alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  editText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  favoriteButton: { alignSelf: "flex-start", borderColor: "#c5745a", borderRadius: 10, borderWidth: 1, minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  favoriteText: { color: "#a8513a", fontSize: 16, fontWeight: "600" },
  deleteButton: { alignSelf: "flex-start", borderColor: "#a12f2f", borderRadius: 10, borderWidth: 1, minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  deleteText: { color: "#a12f2f", fontSize: 16, fontWeight: "600" },
  meta: { color: "#526354", fontSize: 15 },
  description: { color: "#465a4d", fontSize: 16, lineHeight: 24 },
  heading: { color: "#244c38", fontSize: 21, fontWeight: "700", marginTop: 10 },
  line: { color: "#263d2d", fontSize: 16, lineHeight: 24 },
});
