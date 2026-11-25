import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson, putJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import { currentWeekStart, formatDayLabel, isWeeklyPlanResponse, mealSlots, shiftCalendarDate, type MealSlot, type WeeklyPlan } from "@/meal-planner/plan";
import { filterRecipes, isRecipeList, type RecipeSummary } from "@/recipes/recipe";

type DraftMeal = { key: string; recipeId: string; dayOffset: number; mealSlot: MealSlot | null };
type PickerTarget = { dayOffset: number; mealSlot: MealSlot };

function toDraft(plan: WeeklyPlan | null): DraftMeal[] {
  return (plan?.meals ?? []).map((meal) => ({
    key: meal.id, recipeId: meal.recipeId, dayOffset: meal.dayOffset, mealSlot: meal.mealSlot,
  }));
}

function toInput(meals: DraftMeal[]) {
  return meals.map((meal, index) => ({
    recipeId: meal.recipeId,
    dayOffset: meal.dayOffset,
    position: meals.slice(0, index).filter((previous) => previous.dayOffset === meal.dayOffset).length,
    mealSlot: meal.mealSlot,
  }));
}

export default function MealPlannerScreen({ session }: { session: Session }) {
  const { clearSession } = useAuth();
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [meals, setMeals] = useState<DraftMeal[]>([]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const forceReloadRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nextKey = useRef(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [recipeAttempt, setRecipeAttempt] = useState(0);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<ScrollViewInstance>(null);

  useFocusEffect(useCallback(() => {
    if (dirtyRef.current && !forceReloadRef.current) return;
    forceReloadRef.current = false;
    let active = true;
    setLoading(true);
    getJson(`/api/weekly-plans/${weekStart}?refresh=${loadAttempt}`, isWeeklyPlanResponse, session.token).then(
      ({ plan }) => {
        if (!active) return;
        setMeals(toDraft(plan));
        setRevision(plan?.revision ?? null);
        setLoadedWeek(weekStart);
        setDirty(false);
        dirtyRef.current = false;
        setConflict(false);
        setPlanError(null);
        setSaveError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
        setPlanError(caught instanceof Error ? caught.message : "Unable to load this week.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, loadAttempt, session.token, weekStart]));

  useEffect(() => {
    let active = true;
    getJson("/api/recipes", isRecipeList, session.token).then(
      ({ recipes: loaded }) => {
        if (!active) return;
        setRecipes(loaded);
        setRecipesError(null);
        setRecipesLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
        setRecipesError(caught instanceof Error ? caught.message : "Unable to load recipes.");
        setRecipesLoading(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, recipeAttempt, session.token]);

  function changeWeek(amount: number) {
    if (savingRef.current) return;
    const next = shiftCalendarDate(weekStart, amount * 7);
    if (dirty) {
      Alert.alert("Discard changes?", "Unsaved meal plan changes will be lost when you change weeks.", [
        { text: "Stay", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => switchWeek(next) },
      ]);
    } else {
      switchWeek(next);
    }
  }

  function switchWeek(next: string) {
    if (next === weekStart) return;
    dirtyRef.current = false;
    setDirty(false);
    setLoading(true);
    setLoadedWeek(null);
    setPlanError(null);
    setSaveError(null);
    setPicker(null);
    setWeekStart(next);
  }

  function reloadPlan() {
    if (savingRef.current) return;
    const reload = () => { forceReloadRef.current = true; setLoading(true); setPlanError(null); setLoadAttempt((value) => value + 1); };
    if (dirty) {
      Alert.alert("Reload this week?", "This discards your unsaved changes and loads the latest plan.", [
        { text: "Keep changes", style: "cancel" },
        { text: "Reload", style: "destructive", onPress: reload },
      ]);
    } else {
      reload();
    }
  }

  function addMeal(recipeId: string) {
    if (!picker || savingRef.current || meals.length >= 70) return;
    setMeals((current) => [...current, { key: `new-${nextKey.current++}`, recipeId, ...picker }]);
    setDirty(true);
    dirtyRef.current = true;
    setSaveError(null);
    setPicker(null);
    setQuery("");
  }

  function openPicker(dayOffset: number, mealSlot: MealSlot) {
    setPicker({ dayOffset, mealSlot });
    setQuery("");
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function removeMeal(key: string) {
    if (savingRef.current) return;
    setMeals((current) => current.filter((meal) => meal.key !== key));
    setDirty(true);
    dirtyRef.current = true;
    setSaveError(null);
  }

  async function save() {
    if (!dirty || loadedWeek !== weekStart || loading || savingRef.current || conflict) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await putJson(`/api/weekly-plans/${weekStart}`, {
        meals: toInput(meals), expectedRevision: revision,
      }, isWeeklyPlanResponse, session.token);
      if (!result.plan) throw new Error("Pantry returned an empty plan after saving.");
      setMeals(toDraft(result.plan));
      setRevision(result.plan.revision);
      setDirty(false);
      dirtyRef.current = false;
      setConflict(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 409) {
        setConflict(true);
        setSaveError("This week changed on another device. Your edits are still here. Reload the latest plan before saving again.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setSaveError("A planned recipe is no longer available. Reload recipes and check this week before saving.");
      } else {
        setSaveError(caught instanceof Error ? caught.message : "Unable to save this week.");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const matches = filterRecipes(recipes, query);
  const canEdit = loadedWeek === weekStart && !loading && !saving;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Meal Planner</Text>
        <View style={styles.weekControls}>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => changeWeek(-1)} style={styles.smallButton}><Text style={styles.buttonText}>← Previous</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => changeWeek(1)} style={styles.smallButton}><Text style={styles.buttonText}>Next →</Text></Pressable>
        </View>
        <Text style={styles.weekLabel}>Week of {formatDayLabel(weekStart, 0)}</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Loading meal plan" color="#35644f" /> : null}
        {planError ? <Text accessibilityRole="alert" style={styles.error}>{planError}</Text> : null}
        {(planError || conflict) ? <Pressable accessibilityRole="button" onPress={reloadPlan} style={styles.smallButton}><Text style={styles.buttonText}>Reload latest plan</Text></Pressable> : null}
        {loadedWeek === weekStart ? (
          <>
            {picker ? (
              <View style={styles.picker}>
                <Text style={styles.dayTitle}>Add {picker.mealSlot} on {formatDayLabel(weekStart, picker.dayOffset)}</Text>
                <TextInput accessibilityLabel="Search recipes to plan" onChangeText={setQuery} placeholder="Search recipes" style={styles.search} value={query} />
                {recipesLoading ? <ActivityIndicator color="#35644f" /> : null}
                {recipesError ? <Text accessibilityRole="alert" style={styles.error}>{recipesError}</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => { setRecipesLoading(true); setRecipeAttempt((value) => value + 1); }}><Text style={styles.addText}>Refresh recipes</Text></Pressable>
                {!recipesLoading && !recipesError && matches.length === 0 ? <Text style={styles.muted}>No recipes match.</Text> : null}
                {!recipesLoading && !recipesError ? matches.slice(0, 30).map((recipe) => (
                  <Pressable key={recipe.id} accessibilityRole="button" onPress={() => addMeal(recipe.id)} style={styles.recipeChoice}>
                    <Text style={styles.mealName}>{recipe.name}</Text>
                  </Pressable>
                )) : null}
                {matches.length > 30 ? <Text style={styles.muted}>Showing 30 recipes. Search to narrow the list.</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => setPicker(null)}><Text style={styles.removeText}>Cancel</Text></Pressable>
              </View>
            ) : null}
            {Array.from({ length: 7 }, (_, dayOffset) => (
              <View key={dayOffset} style={styles.day}>
                <Text style={styles.dayTitle}>{formatDayLabel(weekStart, dayOffset)}</Text>
                {mealSlots.map((slot) => (
                  <View key={slot} style={styles.slot}>
                    <View style={styles.slotHeading}>
                      <Text style={styles.slotTitle}>{slot[0].toUpperCase() + slot.slice(1)}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Add ${slot} on ${formatDayLabel(weekStart, dayOffset)}`}
                        disabled={!canEdit || meals.length >= 70} onPress={() => openPicker(dayOffset, slot)}>
                        <Text style={styles.addText}>+ Add</Text>
                      </Pressable>
                    </View>
                    {meals.filter((meal) => meal.dayOffset === dayOffset && meal.mealSlot === slot).map((meal) => (
                      <View key={meal.key} style={styles.mealRow}>
                        <Text style={styles.mealName}>{recipesById.get(meal.recipeId)?.name ?? "Recipe no longer available"}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${recipesById.get(meal.recipeId)?.name ?? "recipe"} from ${slot} on ${formatDayLabel(weekStart, dayOffset)}`}
                          disabled={!canEdit} onPress={() => removeMeal(meal.key)}><Text style={styles.removeText}>Remove</Text></Pressable>
                      </View>
                    ))}
                  </View>
                ))}
                {meals.filter((meal) => meal.dayOffset === dayOffset && meal.mealSlot === null).map((meal) => (
                  <View key={meal.key} style={styles.mealRow}>
                    <Text style={styles.mealName}>{recipesById.get(meal.recipeId)?.name ?? "Recipe no longer available"} · Unassigned</Text>
                    <Pressable accessibilityRole="button" disabled={!canEdit} onPress={() => removeMeal(meal.key)}><Text style={styles.removeText}>Remove</Text></Pressable>
                  </View>
                ))}
              </View>
            ))}
            {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={!dirty || !canEdit || conflict} onPress={() => void save()} style={[styles.save, (!dirty || !canEdit || conflict) && styles.disabled]}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>{dirty ? "Save plan" : "All changes saved"}</Text>}
            </Pressable>
            {dirty ? <Text style={styles.muted}>You have unsaved changes.</Text> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={reloadPlan} style={styles.smallButton}><Text style={styles.buttonText}>Refresh this week</Text></Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { gap: 14, padding: 20, paddingBottom: 40 },
  title: { color: "#244c38", fontSize: 32, fontWeight: "700" },
  weekControls: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  smallButton: { alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: "#35644f", fontSize: 15, fontWeight: "600" },
  weekLabel: { color: "#244c38", fontSize: 19, fontWeight: "600" },
  day: { backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  dayTitle: { color: "#244c38", fontSize: 20, fontWeight: "700" },
  slot: { gap: 6 },
  slotHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  slotTitle: { color: "#465a4d", fontSize: 16, fontWeight: "600" },
  addText: { color: "#35644f", fontSize: 15, fontWeight: "600", paddingVertical: 6 },
  mealRow: { alignItems: "center", backgroundColor: "#f7f6f1", borderRadius: 8, flexDirection: "row", gap: 8, justifyContent: "space-between", padding: 10 },
  mealName: { color: "#263d2d", flex: 1, fontSize: 16 },
  removeText: { color: "#a12f2f", fontSize: 15, fontWeight: "600", paddingVertical: 6 },
  picker: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  search: { borderColor: "#aebfb0", borderRadius: 9, borderWidth: 1, fontSize: 16, minHeight: 46, paddingHorizontal: 10 },
  recipeChoice: { borderBottomColor: "#e1e7df", borderBottomWidth: 1, paddingVertical: 10 },
  muted: { color: "#526354", fontSize: 14 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  save: { alignItems: "center", backgroundColor: "#35644f", borderRadius: 10, minHeight: 48, justifyContent: "center" },
  disabled: { opacity: 0.55 },
  saveText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
});
