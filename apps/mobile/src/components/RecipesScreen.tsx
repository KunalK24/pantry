import { Link, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson, patchJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import RecipeCover from "@/components/RecipeCover";
import { filterRecipes, formatMealType, isRecipeDetail, isRecipeList, type RecipeSummary } from "@/recipes/recipe";

export default function RecipesScreen({ session }: { session: Session }) {
  const { clearSession } = useAuth();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const favoritePendingRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    getJson("/api/recipes", isRecipeList, session.token).then(
      (result) => {
        if (!active) return;
        setRecipes(result.recipes);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearSession();
          return;
        }
        setError(caught instanceof Error ? caught.message : "Unable to load recipes.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, session.token]));

  async function refresh() {
    if (loading || favoritePendingRef.current !== null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getJson("/api/recipes", isRecipeList, session.token);
      setRecipes(result.recipes);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
        return;
      }
      setError(caught instanceof Error ? caught.message : "Unable to load recipes.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite(recipe: RecipeSummary) {
    if (loading || favoritePendingRef.current !== null) return;
    favoritePendingRef.current = recipe.id;
    setFavoritePendingId(recipe.id);
    setFavoriteError(null);
    try {
      const updated = await patchJson(
        `/api/recipes/${encodeURIComponent(recipe.id)}`,
        { isFavorite: !recipe.isFavorite },
        isRecipeDetail,
        session.token,
      );
      setRecipes((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 404) {
        setFavoriteError("Recipe is no longer available.");
        setRecipes((current) => current.filter((item) => item.id !== recipe.id));
      } else {
        setFavoriteError(caught instanceof Error ? caught.message : "Unable to update favorite.");
      }
    } finally {
      favoritePendingRef.current = null;
      setFavoritePendingId(null);
    }
  }

  const visible = filterRecipes(recipes, query);

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visible}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(recipe) => recipe.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Recipe book</Text>
            <Link href="/recipes/new" asChild>
              <Pressable accessibilityRole="button" style={styles.createButton}><Text style={styles.createText}>Add recipe</Text></Pressable>
            </Link>
            <TextInput
              accessibilityLabel="Search recipes"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search name, description, ingredients"
              style={styles.search}
              value={query}
            />
            <Pressable accessibilityRole="button" disabled={loading || favoritePendingId !== null} onPress={() => void refresh()} style={styles.refresh}>
              <Text style={styles.refreshText}>Refresh recipes</Text>
            </Pressable>
            {loading ? <ActivityIndicator accessibilityLabel="Loading recipes" color="#35644f" /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {favoriteError ? <Text accessibilityRole="alert" style={styles.error}>{favoriteError}</Text> : null}
          </View>
        }
        ListEmptyComponent={!loading ? (
          <Text style={styles.empty}>{error ? "Try refreshing recipes." : query.trim() ? "No recipes match your search." : "No recipes yet."}</Text>
        ) : undefined}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Link href={{ pathname: "/recipes/[id]", params: { id: item.id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} style={styles.cardMain}>
                <RecipeCover recipe={item} token={session.token} />
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.description ? <Text numberOfLines={2} style={styles.description}>{item.description}</Text> : null}
                  <Text style={styles.meta}>{[
                    formatMealType(item.mealType),
                    item.timeMinutes ? `${item.timeMinutes} min` : null,
                    item.isFavorite ? "Favorite" : null,
                  ].filter(Boolean).join(" · ") || "View recipe"}</Text>
                </View>
              </Pressable>
            </Link>
            <Pressable accessibilityRole="button" accessibilityLabel={item.isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
              accessibilityState={{ selected: item.isFavorite, disabled: loading || favoritePendingId !== null }} disabled={loading || favoritePendingId !== null}
              onPress={() => void toggleFavorite(item)} style={styles.favoriteButton}>
              <Text style={styles.favoriteText}>{favoritePendingId === item.id ? "…" : item.isFavorite ? "♥" : "♡"}</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { flexGrow: 1, padding: 24 },
  header: { gap: 12, marginBottom: 18 },
  title: { color: "#244c38", fontSize: 34, fontWeight: "700" },
  createButton: { alignSelf: "flex-start", backgroundColor: "#35644f", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  createText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  search: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 10, borderWidth: 1, color: "#1e3325", fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  refresh: { alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: "#35644f", fontSize: 15, fontWeight: "600" },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  empty: { color: "#465a4d", fontSize: 17, paddingVertical: 20 },
  card: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 10, padding: 12 },
  cardMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12 },
  favoriteButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44, marginLeft: 8 },
  favoriteText: { color: "#a8513a", fontSize: 27 },
  cardBody: { flex: 1, gap: 4 },
  name: { color: "#244c38", fontSize: 17, fontWeight: "600" },
  description: { color: "#465a4d", fontSize: 14 },
  meta: { color: "#526354", fontSize: 13 },
});
