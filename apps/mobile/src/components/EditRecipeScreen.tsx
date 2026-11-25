import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import CreateRecipeScreen from "@/components/CreateRecipeScreen";
import { isRecipeDetail, isSafeRecipeId, type RecipeDetail } from "@/recipes/recipe";

export default function EditRecipeScreen({ id, session }: { id: string; session: Session }) {
  const { clearSession } = useAuth();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const invalidId = !isSafeRecipeId(id);

  useEffect(() => {
    if (invalidId) return;
    let active = true;
    getJson(`/api/recipes/${encodeURIComponent(id)}`, isRecipeDetail, session.token).then(
      (result) => { if (active) { setRecipe(result); setError(null); setLoading(false); } },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
        setError(caught instanceof ApiError && caught.status === 404 ? "Recipe not found."
          : caught instanceof Error ? caught.message : "Unable to load recipe.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, id, invalidId, session.token, attempt]);

  if (recipe && !invalidId) return <CreateRecipeScreen initialRecipe={recipe} session={session} />;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Link href="/recipes" asChild><Pressable accessibilityRole="button"><Text style={styles.link}>← Recipe book</Text></Pressable></Link>
        {!invalidId && loading ? <ActivityIndicator accessibilityLabel="Loading recipe" color="#35644f" /> : null}
        {invalidId || error ? <Text accessibilityRole="alert" style={styles.error}>{invalidId ? "Recipe not found." : error}</Text> : null}
        {error && error !== "Recipe not found." ? (
          <Pressable accessibilityRole="button" onPress={() => { setError(null); setLoading(true); setAttempt((current) => current + 1); }}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { gap: 16, padding: 24 },
  link: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  error: { color: "#a12f2f", fontSize: 16 },
});
