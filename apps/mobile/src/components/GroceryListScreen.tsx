import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson, patchJson, postJson, putJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import {
  isGroceryListResponse, isGroceryListsResponse, type GroceryItem,
  type GroceryList, type GroceryListSummary,
} from "@/grocery/list";

const listPath = (id: string): `/${string}` => `/api/grocery-lists/${encodeURIComponent(id)}`;
const shownQuantity = (item: GroceryItem) => item.quantityOverride ?? item.baseQuantity;
const shownUnit = (item: GroceryItem) => item.unitOverride ?? item.baseUnit;
const newManualLineKey = () => `custom:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export default function GroceryListScreen({ session }: { session: Session }) {
  const { clearSession } = useAuth();
  const [lists, setLists] = useState<GroceryListSummary[]>([]);
  const [list, setList] = useState<GroceryList | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");

  function clearItemDrafts() {
    setEditingKey(null);
    setEditName("");
    setEditQuantity("");
    setEditUnit("");
    setNewItemName("");
    setNewItemQuantity("");
    setNewItemUnit("");
  }

  function confirmDiscard(action: () => void) {
    const hasDraft = Boolean(
      newItemName.trim() || newItemQuantity.trim() || newItemUnit.trim() || editingKey ||
      (list && renameName.trim() !== list.name)
    );
    if (!hasDraft) { action(); return; }
    Alert.alert("Discard entered changes?", "Opening, creating, or reloading a list clears the item and name fields you have entered.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: action },
    ]);
  }

  useEffect(() => {
    let active = true;
    getJson("/api/grocery-lists", isGroceryListsResponse, session.token).then(
      (result) => { if (active) { setLists(result.lists); setError(null); setLoadingLists(false); } },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
        setError(caught instanceof Error ? caught.message : "Unable to load grocery lists.");
        setLoadingLists(false);
      },
    );
    return () => { active = false; };
  }, [clearSession, session.token]);

  function handleError(caught: unknown, fallback: string) {
    if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
    if (caught instanceof ApiError && caught.status === 404) {
      setList(null);
      setError("That list no longer exists. Refresh your lists.");
      return;
    }
    if (caught instanceof ApiError && caught.status === 409) {
      setConflict(true);
      setError("This list changed on another device. Reload it, then repeat your change.");
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
  }

  async function refreshLists() {
    if (busyRef.current) return;
    setLoadingLists(true);
    try {
      const result = await getJson("/api/grocery-lists", isGroceryListsResponse, session.token);
      setLists(result.lists);
      setError(null);
    } catch (caught) {
      handleError(caught, "Unable to refresh grocery lists.");
    } finally { setLoadingLists(false); }
  }

  async function openList(id: string) {
    if (busyRef.current || loadingLists || loadingDetail) return;
    setLoadingDetail(true);
    setList(null);
    setConflict(false);
    clearItemDrafts();
    setError(null);
    try {
      const result = await getJson(listPath(id), isGroceryListResponse, session.token);
      setList(result.list);
      setRenameName(result.list.name);
    } catch (caught) {
      handleError(caught, "Unable to load this list.");
    } finally { setLoadingDetail(false); }
  }

  async function reloadList() {
    if (!list || busyRef.current) return;
    setLoadingDetail(true);
    try {
      const result = await getJson(listPath(list.id), isGroceryListResponse, session.token);
      setList(result.list);
      setRenameName(result.list.name);
      setConflict(false);
      clearItemDrafts();
      setError(null);
    } catch (caught) {
      handleError(caught, "Unable to reload this list.");
    } finally { setLoadingDetail(false); }
  }

  async function createList() {
    const name = newListName.trim();
    if (!name || name.length > 100) { setError("Enter a list name up to 100 characters."); return; }
    if (busyRef.current || loadingLists || loadingDetail) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const created = await postJson("/api/grocery-lists", { name }, isGroceryListResponse, session.token);
      setNewListName("");
      setList(created.list);
      setRenameName(created.list.name);
      setConflict(false);
      clearItemDrafts();
      setLists((current) => [{ id: created.list.id, name: created.list.name, updatedAt: created.list.updatedAt, itemCount: 0 }, ...current]);
    } catch (caught) { handleError(caught, "Unable to create this list."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function renameList() {
    if (!list || busyRef.current) return;
    const name = renameName.trim();
    if (!name || name.length > 100) { setError("Enter a list name up to 100 characters."); return; }
    if (name === list.name) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await patchJson(listPath(list.id), { name, expectedRevision: list.revision }, isGroceryListResponse, session.token);
      setList(result.list);
      setLists((current) => current.map((item) => item.id === result.list.id
        ? { ...item, name: result.list.name, updatedAt: result.list.updatedAt } : item));
    } catch (caught) { handleError(caught, "Unable to rename this list."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function saveItems(items: GroceryItem[], onSaved?: () => void) {
    if (!list || busyRef.current || conflict) return;
    const current = list;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await putJson(listPath(current.id), {
        expectedRevision: current.revision,
        importedWeeklyPlanId: current.importedWeeklyPlanId,
        recipes: current.recipes,
        items,
      }, isGroceryListResponse, session.token);
      setList(result.list);
      setLists((previous) => previous.map((item) => item.id === result.list.id
        ? { ...item, itemCount: result.list.items.length, updatedAt: result.list.updatedAt } : item));
      onSaved?.();
    } catch (caught) { handleError(caught, "Unable to save this list."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function addItem() {
    if (!list || busy || conflict) return;
    const name = newItemName.trim();
    const quantity = newItemQuantity.trim();
    const unit = newItemUnit.trim();
    if (!name || name.length > 200 || quantity.length > 100 || unit.length > 100) {
      setError("Enter an item name (up to 200 characters) and shorter quantity and unit values."); return;
    }
    if (list.items.length >= 1000) { setError("A grocery list can hold at most 1,000 items."); return; }
    const item: GroceryItem = {
      lineKey: newManualLineKey(),
      name, baseQuantity: quantity, baseUnit: unit,
      quantityOverride: null, unitOverride: null, checked: false, dismissed: false, pantryItemId: null,
    };
    void saveItems([...list.items, item], () => { setNewItemName(""); setNewItemQuantity(""); setNewItemUnit(""); });
  }

  function startEdit(item: GroceryItem) {
    if (busy || conflict) return;
    setEditingKey(item.lineKey);
    setEditName(item.name);
    setEditQuantity(shownQuantity(item));
    setEditUnit(shownUnit(item));
    setError(null);
  }

  function saveEdit() {
    if (!list || !editingKey || busy || conflict) return;
    const item = list.items.find((row) => row.lineKey === editingKey);
    if (!item) { setEditingKey(null); return; }
    const name = editName.trim();
    const quantity = editQuantity.trim();
    const unit = editUnit.trim();
    if (!name || name.length > 200 || quantity.length > 100 || unit.length > 100) {
      setError("Enter an item name (up to 200 characters) and shorter quantity and unit values."); return;
    }
    const manual = item.lineKey.startsWith("custom:");
    const changed: GroceryItem = manual ? {
      ...item, name, baseQuantity: quantity, baseUnit: unit, quantityOverride: null, unitOverride: null,
    } : {
      ...item,
      quantityOverride: quantity === item.baseQuantity ? null : quantity,
      unitOverride: unit === item.baseUnit ? null : unit,
    };
    void saveItems(list.items.map((row) => row.lineKey === editingKey ? changed : row), () => setEditingKey(null));
  }

  const activeItems = list?.items.filter((item) => !item.dismissed) ?? [];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Grocery List</Text>
        <Text style={styles.heading}>Your lists</Text>
        <View style={styles.row}>
          <TextInput accessibilityLabel="New grocery list name" editable={!busy} maxLength={100}
            onChangeText={setNewListName} placeholder="New list name" style={[styles.input, styles.flex]} value={newListName} />
          <Pressable accessibilityRole="button" disabled={busy || loadingLists || loadingDetail} onPress={() => confirmDiscard(() => { void createList(); })} style={styles.action}>
            <Text style={styles.actionText}>Create</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" disabled={busy || loadingLists} onPress={() => void refreshLists()} style={styles.secondary}>
          <Text style={styles.secondaryText}>Refresh lists</Text>
        </Pressable>
        {loadingLists ? <ActivityIndicator accessibilityLabel="Loading grocery lists" color="#35644f" /> : null}
        {!loadingLists && lists.length === 0 ? <Text style={styles.muted}>No grocery lists yet.</Text> : null}
        {lists.map((entry) => (
          <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: list?.id === entry.id }}
            disabled={busy || loadingDetail} onPress={() => confirmDiscard(() => { void openList(entry.id); })} style={[styles.listRow, list?.id === entry.id && styles.selectedRow]}>
            <Text style={styles.listName}>{entry.name}</Text>
            <Text style={styles.muted}>{entry.itemCount} items</Text>
          </Pressable>
        ))}
        {loadingDetail ? <ActivityIndicator accessibilityLabel="Loading grocery list" color="#35644f" /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {conflict && list ? <Pressable accessibilityRole="button" disabled={loadingDetail} onPress={() => confirmDiscard(() => { void reloadList(); })} style={styles.secondary}>
          <Text style={styles.secondaryText}>Reload and discard draft</Text>
        </Pressable> : null}
        {list ? <View style={styles.detail}>
          <Text style={styles.heading}>{list.name}</Text>
          <Pressable accessibilityRole="button" disabled={busy || loadingDetail} onPress={() => confirmDiscard(() => { void reloadList(); })} style={styles.secondary}>
            <Text style={styles.secondaryText}>Refresh this list</Text>
          </Pressable>
          <Text style={styles.muted}>Refresh before editing changes made on the web. Reloading clears the item form.</Text>
          <Text style={styles.label}>List name</Text>
          <View style={styles.row}>
            <TextInput accessibilityLabel="Rename grocery list" editable={!busy} maxLength={100} onChangeText={setRenameName}
              style={[styles.input, styles.flex]} value={renameName} />
            <Pressable accessibilityRole="button" disabled={busy || conflict} onPress={() => void renameList()} style={styles.action}>
              <Text style={styles.actionText}>Rename</Text>
            </Pressable>
          </View>
          <Text style={styles.heading}>Items</Text>
          {activeItems.length === 0 ? <Text style={styles.muted}>No items yet.</Text> : null}
          {activeItems.map((item) => (
            <View key={item.lineKey} style={styles.itemRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.checked ? "Uncheck" : "Check"} ${item.name}`}
                accessibilityState={{ checked: item.checked, disabled: busy || conflict }} disabled={busy || conflict}
                onPress={() => void saveItems(list.items.map((row) => row.lineKey === item.lineKey ? { ...row, checked: !row.checked } : row))}
                style={styles.checkbox}><Text style={styles.checkText}>{item.checked ? "☑" : "□"}</Text></Pressable>
              <View style={styles.flex}>
                <Text style={[styles.itemName, item.checked && styles.checked]}>{item.name}</Text>
                <Text style={styles.muted}>{[shownQuantity(item), shownUnit(item)].filter(Boolean).join(" ") || "No quantity"}</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={busy || conflict} onPress={() => startEdit(item)} style={styles.smallAction}>
                <Text style={styles.secondaryText}>Edit</Text>
              </Pressable>
            </View>
          ))}
          {editingKey ? <View style={styles.form}>
            <Text style={styles.label}>Edit item</Text>
            {editingKey.startsWith("custom:") ? <TextInput accessibilityLabel="Edit item name" editable={!busy} maxLength={200}
              onChangeText={setEditName} style={styles.input} value={editName} />
              : <Text style={styles.muted}>Recipe and plan items keep their name. You can adjust their quantity and unit.</Text>}
            <View style={styles.row}>
              <TextInput accessibilityLabel="Edit item quantity" editable={!busy} maxLength={100} onChangeText={setEditQuantity}
                placeholder="Quantity" style={[styles.input, styles.flex]} value={editQuantity} />
              <TextInput accessibilityLabel="Edit item unit" editable={!busy} maxLength={100} onChangeText={setEditUnit}
                placeholder="Unit" style={[styles.input, styles.flex]} value={editUnit} />
            </View>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" disabled={busy || conflict} onPress={saveEdit} style={styles.action}><Text style={styles.actionText}>Save item</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditingKey(null)} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            </View>
          </View> : null}
          <Text style={styles.heading}>Add item manually</Text>
          <TextInput accessibilityLabel="New item name" editable={!busy} maxLength={200} onChangeText={setNewItemName}
            placeholder="Item name" style={styles.input} value={newItemName} />
          <View style={styles.row}>
            <TextInput accessibilityLabel="New item quantity" editable={!busy} maxLength={100} onChangeText={setNewItemQuantity}
              placeholder="Quantity (optional)" style={[styles.input, styles.flex]} value={newItemQuantity} />
            <TextInput accessibilityLabel="New item unit" editable={!busy} maxLength={100} onChangeText={setNewItemUnit}
              placeholder="Unit (optional)" style={[styles.input, styles.flex]} value={newItemUnit} />
          </View>
          <Pressable accessibilityRole="button" disabled={busy || conflict} onPress={addItem} style={styles.action}>
            <Text style={styles.actionText}>{busy ? "Saving…" : "Add item"}</Text>
          </Pressable>
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { gap: 12, padding: 24, paddingBottom: 50 },
  title: { color: "#244c38", fontSize: 32, fontWeight: "700" },
  heading: { color: "#244c38", fontSize: 22, fontWeight: "700", marginTop: 8 },
  label: { color: "#244c38", fontSize: 15, fontWeight: "600" },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  input: { backgroundColor: "#ffffff", borderColor: "#aebfb0", borderRadius: 9, borderWidth: 1, color: "#1e3325", fontSize: 16, minHeight: 46, paddingHorizontal: 12 },
  action: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#35644f", borderRadius: 9, justifyContent: "center", minHeight: 46, paddingHorizontal: 14 },
  actionText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  secondary: { alignItems: "center", alignSelf: "flex-start", borderColor: "#35644f", borderRadius: 9, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  secondaryText: { color: "#35644f", fontSize: 15, fontWeight: "600" },
  muted: { color: "#526354", fontSize: 14 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  listRow: { backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 10, borderWidth: 1, gap: 3, padding: 12 },
  selectedRow: { borderColor: "#35644f", borderWidth: 2 },
  listName: { color: "#244c38", fontSize: 17, fontWeight: "600" },
  detail: { gap: 10, marginTop: 12 },
  itemRow: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 8, padding: 10 },
  checkbox: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  checkText: { color: "#35644f", fontSize: 28 },
  itemName: { color: "#263d2d", fontSize: 16, fontWeight: "600" },
  checked: { textDecorationLine: "line-through" },
  smallAction: { borderColor: "#35644f", borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  form: { backgroundColor: "#edf1e9", borderRadius: 10, gap: 8, padding: 12 },
});
