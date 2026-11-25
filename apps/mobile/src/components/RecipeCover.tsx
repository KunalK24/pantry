import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { getApiBaseUrl } from "@/config";
import type { RecipeSummary } from "@/recipes/recipe";

export default function RecipeCover({ recipe, token, large = false }: {
  recipe: Pick<RecipeSummary, "id" | "name" | "imageUrl">;
  token: string;
  large?: boolean;
}) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const imageKey = `${token}:${recipe.imageUrl}`;
  const failed = failedKey === imageKey;

  const validImage = recipe.imageUrl === `/api/recipes/${recipe.id}/image`;
  const source = useMemo(() => validImage ? {
    uri: `${getApiBaseUrl()}${recipe.imageUrl}`,
    headers: { Authorization: `Bearer ${token}` },
    cache: "reload" as const,
  } : null, [recipe.imageUrl, token, validImage]);
  if (!validImage || failed) {
    return (
      <View style={[styles.placeholder, large ? styles.large : styles.small]}>
        <Text style={styles.placeholderText}>{failed ? "Photo unavailable" : "No photo"}</Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={`${recipe.name} photo`}
      onError={() => setFailedKey(imageKey)}
      source={source ?? undefined}
      style={[styles.image, large ? styles.large : styles.small]}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: "#e7ebe4", borderRadius: 10 },
  placeholder: { alignItems: "center", backgroundColor: "#e7ebe4", borderRadius: 10, justifyContent: "center" },
  placeholderText: { color: "#526354", fontSize: 13 },
  small: { width: 72, height: 72 },
  large: { width: "100%", height: 220 },
});
