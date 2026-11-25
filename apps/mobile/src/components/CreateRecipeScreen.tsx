import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, postJson, putJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import { isRecipeDetail, type RecipeDetail, type RecipeSummary } from "@/recipes/recipe";

type IngredientDraft = {
  id: number; name: string; quantity: string; unit: string;
  originalName: string; brand: string | null; modifiers: string[];
  packageQuantity: string | null; packageUnit: string | null;
};
type StepDraft = { id: number; text: string };
type MealType = NonNullable<RecipeSummary["mealType"]>;
const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];
const emptyIngredient = (id: number): IngredientDraft => ({
  id, name: "", quantity: "", unit: "", originalName: "", brand: null,
  modifiers: [], packageQuantity: null, packageUnit: null,
});

export default function CreateRecipeScreen({ session, initialRecipe }: { session: Session; initialRecipe?: RecipeDetail }) {
  const { clearSession } = useAuth();
  const [name, setName] = useState(initialRecipe?.name ?? "");
  const [description, setDescription] = useState(initialRecipe?.description ?? "");
  const [mealType, setMealType] = useState<MealType | null>(initialRecipe?.mealType ?? null);
  const [time, setTime] = useState(initialRecipe?.timeMinutes?.toString() ?? "");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(initialRecipe?.ingredients.map((item, id) => ({
    id, name: item.name, quantity: item.quantity ?? "", unit: item.unit ?? "",
    originalName: item.name, brand: item.brand, modifiers: item.modifiers,
    packageQuantity: item.packageQuantity, packageUnit: item.packageUnit,
  })) ?? [emptyIngredient(0)]);
  const [steps, setSteps] = useState<StepDraft[]>(initialRecipe?.instructions.map((text, id) => ({ id, text })) ?? [{ id: 0, text: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nextId = useRef(initialRecipe?.ingredients.length ?? 1);
  const nextStepId = useRef(initialRecipe?.instructions.length ?? 1);

  function updateIngredient(id: number, field: "name" | "quantity" | "unit", value: string) {
    setIngredients((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
    setError(null);
  }

  async function save() {
    if (savingRef.current) return;
    const recipeName = name.trim();
    const recipeDescription = description.trim();
    const instructions = steps.map((step) => step.text.trim());
    const parsedIngredients = ingredients.map((item) => ({
      name: item.name.trim(), quantity: item.quantity.trim(), unit: item.unit.trim(),
      ...(initialRecipe && item.originalName === item.name.trim() ? {
        brand: item.brand, modifiers: item.modifiers,
        packageQuantity: item.packageQuantity, packageUnit: item.packageUnit,
      } : {}),
    }));
    const minutes = time.trim() === "" ? null : Number(time.trim());

    if (!recipeName || recipeName.length > 200) {
      setError("Enter a recipe name of up to 200 characters."); return;
    }
    if (recipeDescription.length > 2000) {
      setError("Keep the description under 2,000 characters."); return;
    }
    if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 2_147_483_647)) {
      setError("Enter a whole number of minutes greater than zero."); return;
    }
    if (parsedIngredients.length > 100 || parsedIngredients.some((item) =>
      !item.name || item.name.length > 200 || !item.quantity || item.quantity.length > 100 || item.unit.length > 100)) {
      setError("Add 1–100 ingredients, each with a name and quantity."); return;
    }
    if (instructions.length < 1 || instructions.length > 100 || instructions.some((step) => !step) ||
      instructions.some((step) => step.length > 20000) || instructions.join("").length > 20000) {
      setError("Add 1–100 instruction lines (up to 20,000 characters total)."); return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: recipeName,
        ...(recipeDescription ? { description: recipeDescription } : {}),
        instructions,
        mealType,
        timeMinutes: minutes,
        ingredients: parsedIngredients.map((item) => ({
          name: item.name, quantity: item.quantity, ...(item.unit ? { unit: item.unit } : {}),
          ...("brand" in item ? { brand: item.brand, modifiers: item.modifiers, packageQuantity: item.packageQuantity, packageUnit: item.packageUnit } : {}),
        })),
      };
      if (initialRecipe) {
        await putJson(`/api/recipes/${encodeURIComponent(initialRecipe.id)}`, body, isRecipeDetail, session.token);
        router.dismissTo("/recipes");
      } else {
        const created = await postJson("/api/recipes", body, isRecipeDetail, session.token);
        router.replace({ pathname: "/recipes/[id]", params: { id: created.id } });
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession(); return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setError("Recipe no longer exists. Return to Recipe book and refresh the list."); return;
      }
      setError(caught instanceof ApiError && caught.status === 400
        ? "Check the recipe fields and try again."
        : caught instanceof Error ? caught.message : "Unable to save this recipe.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Link href={initialRecipe ? { pathname: "/recipes/[id]", params: { id: initialRecipe.id } } : "/recipes"} asChild>
          <Pressable accessibilityRole="button" style={styles.back}><Text style={styles.link}>{initialRecipe ? "← Recipe" : "← Recipe book"}</Text></Pressable>
        </Link>
        <Text style={styles.title}>{initialRecipe ? "Edit recipe" : "New recipe"}</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput accessibilityLabel="Recipe name" editable={!saving} maxLength={200} onChangeText={(value) => { setName(value); setError(null); }} style={styles.input} value={name} />
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput accessibilityLabel="Recipe description" editable={!saving} maxLength={2000} multiline onChangeText={setDescription} style={[styles.input, styles.multiline]} value={description} />
        <Text style={styles.label}>Meal type (optional)</Text>
        <View style={styles.choices}>
          {[null, ...mealTypes].map((option) => (
            <Pressable key={option ?? "none"} accessibilityRole="button" accessibilityState={{ selected: mealType === option }} disabled={saving}
              onPress={() => setMealType(option)} style={[styles.choice, mealType === option && styles.selectedChoice]}>
              <Text style={mealType === option ? styles.selectedChoiceText : styles.choiceText}>{option ? option[0].toUpperCase() + option.slice(1) : "Not set"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Time in minutes (optional)</Text>
        <TextInput accessibilityLabel="Time in minutes" editable={!saving} keyboardType="number-pad" onChangeText={setTime} style={styles.input} value={time} />
        <Text style={styles.heading}>Ingredients</Text>
        {ingredients.map((item, index) => (
          <View key={item.id} style={styles.group}>
            <Text style={styles.groupTitle}>Ingredient {index + 1}</Text>
            <TextInput accessibilityLabel={`Ingredient ${index + 1} name`} editable={!saving} maxLength={200} onChangeText={(value) => updateIngredient(item.id, "name", value)} placeholder="Name" style={styles.input} value={item.name} />
            <View style={styles.row}>
              <TextInput accessibilityLabel={`Ingredient ${index + 1} quantity`} editable={!saving} maxLength={100} onChangeText={(value) => updateIngredient(item.id, "quantity", value)} placeholder="Quantity" style={[styles.input, styles.half]} value={item.quantity} />
              <TextInput accessibilityLabel={`Ingredient ${index + 1} unit`} editable={!saving} maxLength={100} onChangeText={(value) => updateIngredient(item.id, "unit", value)} placeholder="Unit (optional)" style={[styles.input, styles.half]} value={item.unit} />
            </View>
            {ingredients.length > 1 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => setIngredients((current) => current.filter((row) => row.id !== item.id))}><Text style={styles.remove}>Remove ingredient</Text></Pressable> : null}
          </View>
        ))}
        <Pressable accessibilityRole="button" disabled={saving || ingredients.length >= 100} onPress={() => setIngredients((current) => [...current, emptyIngredient(nextId.current++)])} style={styles.secondary}><Text style={styles.link}>Add ingredient</Text></Pressable>
        <Text style={styles.heading}>Instructions</Text>
        {steps.map((step, index) => (
          <View key={step.id} style={styles.group}>
            <Text style={styles.groupTitle}>Step {index + 1}</Text>
            <TextInput accessibilityLabel={`Step ${index + 1} instructions`} editable={!saving} maxLength={20000} multiline
              onChangeText={(value) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, text: value } : item))}
              style={[styles.input, styles.steps]} value={step.text} />
            {steps.length > 1 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))}><Text style={styles.remove}>Remove step</Text></Pressable> : null}
          </View>
        ))}
        <Pressable accessibilityRole="button" disabled={saving || steps.length >= 100}
          onPress={() => setSteps((current) => [...current, { id: nextStepId.current++, text: "" }])} style={styles.secondary}>
          <Text style={styles.link}>Add step</Text>
        </Pressable>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.save}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>{initialRecipe ? "Save changes" : "Save recipe"}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { gap: 10, padding: 24, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  link: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  title: { color: "#244c38", fontSize: 32, fontWeight: "700" },
  heading: { color: "#244c38", fontSize: 22, fontWeight: "700", marginTop: 16 },
  label: { color: "#244c38", fontSize: 15, fontWeight: "600", marginTop: 6 },
  input: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 9, borderWidth: 1, color: "#1e3325", fontSize: 16, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  steps: { minHeight: 150, textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderColor: "#aebfb0", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  selectedChoice: { backgroundColor: "#35644f", borderColor: "#35644f" },
  choiceText: { color: "#35644f" },
  selectedChoiceText: { color: "#ffffff" },
  group: { backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  groupTitle: { color: "#244c38", fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  remove: { color: "#a12f2f", fontSize: 15, paddingVertical: 6 },
  secondary: { alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 9, borderWidth: 1, padding: 10 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  save: { alignItems: "center", backgroundColor: "#35644f", borderRadius: 10, minHeight: 48, justifyContent: "center", marginTop: 12, padding: 12 },
  saveText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
});
