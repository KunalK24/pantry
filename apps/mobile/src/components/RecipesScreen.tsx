import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import RecipeCover from "@/components/RecipeCover";
import { filterRecipes, formatMealType, isRecipeList, type RecipeSummary } from "@/recipes/recipe";

export default function RecipesScreen({ session }: { session: Session }) {
  const { clearSession } = useAuth();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
  }, [clearSession, session.token]);

  async function refresh() {
    if (loading) return;
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
            <TextInput
              accessibilityLabel="Search recipes"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search name, description, ingredients"
              style={styles.search}
              value={query}
            />
            <Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={styles.refresh}>
              <Text style={styles.refreshText}>Refresh recipes</Text>
            </Pressable>
            {loading ? <ActivityIndicator accessibilityLabel="Loading recipes" color="#35644f" /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={!loading ? (
          <Text style={styles.empty}>{error ? "Try refreshing recipes." : query.trim() ? "No recipes match your search." : "No recipes yet."}</Text>
        ) : undefined}
        renderItem={({ item }) => (
          <Link href={{ pathname: "/recipes/[id]", params: { id: item.id } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} style={styles.card}>
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
  search: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 10, borderWidth: 1, color: "#1e3325", fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  refresh: { alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: "#35644f", fontSize: 15, fontWeight: "600" },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  empty: { color: "#465a4d", fontSize: 17, paddingVertical: 20 },
  card: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, marginBottom: 10, padding: 12 },
  cardBody: { flex: 1, gap: 4 },
  name: { color: "#244c38", fontSize: 17, fontWeight: "600" },
  description: { color: "#465a4d", fontSize: 14 },
  meta: { color: "#526354", fontSize: 13 },
});
