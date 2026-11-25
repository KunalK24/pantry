import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiError, postJson } from "@/api/client";
import { isPantryItem, isValidPantryDate, pantryLocations, type PantryItem, type PantryLocation } from "@/pantry/item";

export default function AddPantryItemForm({
  token,
  onCreated,
  onCancel,
  onUnauthorized,
}: {
  token: string;
  onCreated: (item: PantryItem) => void;
  onCancel: () => void;
  onUnauthorized: () => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<PantryLocation | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function save() {
    if (submittingRef.current) return;

    const trimmedName = name.trim().replace(/\s+/gu, " ");
    const trimmedQuantity = quantity.trim();
    const trimmedUnit = unit.trim();
    const trimmedExpiry = expiresOn.trim();

    if (!trimmedName || trimmedName.length > 200) {
      setError("Enter a name of up to 200 characters.");
      return;
    }
    if (trimmedQuantity.length > 100 || trimmedUnit.length > 100) {
      setError("Quantity and unit must each be 100 characters or less.");
      return;
    }
    if (trimmedExpiry && !isValidPantryDate(trimmedExpiry)) {
      setError("Enter a valid expiration date as YYYY-MM-DD.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await postJson(
        "/api/pantry-items",
        {
          name: trimmedName,
          ...(trimmedQuantity ? { quantity: trimmedQuantity } : {}),
          ...(trimmedUnit ? { unit: trimmedUnit } : {}),
          location,
          expiresOn: trimmedExpiry || null,
        },
        isPantryItem,
        token,
      );
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      if (caught instanceof ApiError && caught.status === 409) {
        setError("An item with this name is already in your pantry.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError("Check the item details and try again.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to add this item. Try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.heading}>Add pantry item</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput accessibilityLabel="Item name" autoCapitalize="words" autoCorrect={false} editable={!submitting} maxLength={200}
        onChangeText={(value) => { setName(value); setError(null); }} placeholder="e.g. Milk" style={styles.input} value={name} />
      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Quantity</Text>
          <TextInput accessibilityLabel="Quantity" editable={!submitting} maxLength={100}
            onChangeText={(value) => { setQuantity(value); setError(null); }} placeholder="e.g. 2" style={styles.input} value={quantity} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Unit</Text>
          <TextInput accessibilityLabel="Unit" autoCorrect={false} editable={!submitting} maxLength={100}
            onChangeText={(value) => { setUnit(value); setError(null); }} placeholder="e.g. cartons" style={styles.input} value={unit} />
        </View>
      </View>
      <Text style={styles.label}>Location</Text>
      <View style={styles.locations}>
        {[null, ...pantryLocations].map((option) => (
          <Pressable key={option ?? "none"} accessibilityRole="button" accessibilityState={{ selected: location === option }}
            disabled={submitting} onPress={() => { setLocation(option); setError(null); }}
            style={[styles.location, location === option && styles.selectedLocation]}>
            <Text style={[styles.locationText, location === option && styles.selectedLocationText]}>{option ?? "Not set"}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Expiration date (optional)</Text>
      <TextInput accessibilityLabel="Expiration date, year month day" autoCapitalize="none" autoCorrect={false} editable={!submitting}
        maxLength={10} onChangeText={(value) => { setExpiresOn(value); setError(null); }}
        placeholder="YYYY-MM-DD" style={styles.input} value={expiresOn} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={submitting} onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void save()}
          style={[styles.primaryButton, submitting && styles.disabledButton]}>
          {submitting ? <ActivityIndicator accessibilityLabel="Saving item" color="#ffffff" /> : <Text style={styles.primaryText}>Save item</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: "#ffffff", borderColor: "#d8e4d9", borderRadius: 14, borderWidth: 1, gap: 10, padding: 18 },
  heading: { color: "#244c38", fontSize: 21, fontWeight: "700", marginBottom: 2 },
  label: { color: "#244c38", fontSize: 15, fontWeight: "600" },
  input: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 9, borderWidth: 1, color: "#1e3325", fontSize: 16, minHeight: 46, paddingHorizontal: 12 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1, gap: 10 },
  locations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  location: { borderColor: "#aebfb0", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  selectedLocation: { backgroundColor: "#35644f", borderColor: "#35644f" },
  locationText: { color: "#35644f", fontSize: 14 },
  selectedLocationText: { color: "#ffffff", fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  secondaryButton: { borderColor: "#35644f", borderRadius: 9, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  primaryButton: { backgroundColor: "#35644f", borderRadius: 9, minWidth: 110, paddingHorizontal: 16, paddingVertical: 11 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  disabledButton: { opacity: 0.6 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
});
