import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, deleteJson, getJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";
import AddPantryItemForm from "@/components/AddPantryItemForm";
import EditPantryItemForm from "@/components/EditPantryItemForm";
import { isPantryItem, isPantryResponse, type PantryItem } from "@/pantry/item";

export default function PantryScreen({ session }: { session: Session }) {
  const { clearSession, signOut } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<PantryItem>>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getJson("/api/pantry-items", isPantryResponse, session.token).then(
      (result) => {
        if (!active) return;
        setItems(result.items);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          clearSession();
          return;
        }
        setError(caught instanceof Error ? caught.message : "Unable to load pantry items.");
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
      const result = await getJson("/api/pantry-items", isPantryResponse, session.token);
      setItems(result.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
        return;
      }
      setError(caught instanceof Error ? caught.message : "Unable to load pantry items.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function openEdit(item: PantryItem) {
    if (openingEditId || editingItem || deletingId || showAddForm) return;
    setOpeningEditId(item.id);
    setError(null);
    setNotice(null);
    try {
      const fresh = await getJson(`/api/pantry-items/${item.id}`, isPantryItem, session.token);
      setEditingItem(fresh);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 404) {
        setNotice(`${item.name} is no longer in your pantry.`);
        void refresh();
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to load this item.");
      }
    } finally {
      setOpeningEditId(null);
    }
  }

  async function deleteItem(item: PantryItem) {
    if (deletingRef.current !== null) return;
    deletingRef.current = item.id;
    setDeletingId(item.id);
    setError(null);
    setNotice(null);
    try {
      await deleteJson(`/api/pantry-items/${item.id}`, isPantryItem, session.token);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setNotice(`${item.name} deleted from your pantry.`);
      void refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else if (caught instanceof ApiError && caught.status === 404) {
        setNotice(`${item.name} is no longer in your pantry.`);
        void refresh();
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to delete this item.");
      }
    } finally {
      deletingRef.current = null;
      setDeletingId(null);
    }
  }

  function confirmDelete(item: PantryItem) {
    if (loading || editingItem || openingEditId || deletingId || showAddForm) return;
    Alert.alert("Delete pantry item?", `Delete ${item.name} from your pantry?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void deleteItem(item); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.content}
        data={items}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Your pantry</Text>
            <Text style={styles.email}>{session.user.email}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={loading || showAddForm || editingItem !== null || openingEditId !== null || deletingId !== null}
                onPress={() => { setNotice(null); setShowAddForm(true); }} style={[styles.action, styles.addAction]}>
                <Text style={styles.addActionText}>Add item</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={loading || showAddForm || editingItem !== null || openingEditId !== null || deletingId !== null} onPress={() => void refresh()} style={styles.action}>
                <Text style={styles.actionText}>Refresh</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => void handleSignOut()} style={styles.action}>
                <Text style={styles.actionText}>Sign out</Text>
              </Pressable>
            </View>
            {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
            {loading ? <ActivityIndicator accessibilityLabel="Loading pantry" color="#35644f" /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {showAddForm ? (
              <AddPantryItemForm
                token={session.token}
                onCancel={() => setShowAddForm(false)}
                onUnauthorized={clearSession}
                onCreated={(created) => {
                  setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
                  setShowAddForm(false);
                  setNotice(`${created.name} added to your pantry.`);
                  void refresh();
                }}
              />
            ) : null}
            {editingItem ? (
              <EditPantryItemForm
                key={editingItem.id}
                item={editingItem}
                token={session.token}
                onCancel={() => setEditingItem(null)}
                onUnauthorized={clearSession}
                onMissing={() => {
                  setEditingItem(null);
                  setNotice("This item is no longer in your pantry.");
                  void refresh();
                }}
                onSaved={(saved) => {
                  setItems((current) => current.map((item) => item.id === saved.id ? saved : item)
                    .sort((a, b) => a.name.localeCompare(b.name)));
                  setEditingItem(null);
                  setNotice(`${saved.name} updated.`);
                  void refresh();
                }}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Your pantry is empty.</Text> : undefined}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.quantity || item.unit ? (
              <Text style={styles.itemDetail}>{[item.quantity, item.unit].filter(Boolean).join(" ")}</Text>
            ) : null}
            {item.location ? <Text style={styles.itemDetail}>{item.location}</Text> : null}
            {item.expiresOn ? <Text style={styles.itemDetail}>Expires {item.expiresOn}</Text> : null}
            <View style={styles.itemActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}
                disabled={loading || showAddForm || editingItem !== null || openingEditId !== null || deletingId !== null}
                onPress={() => void openEdit(item)} style={styles.itemAction}>
                <Text style={styles.actionText}>{openingEditId === item.id ? "Opening…" : "Edit"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`}
                disabled={loading || showAddForm || editingItem !== null || openingEditId !== null || deletingId !== null}
                onPress={() => confirmDelete(item)} style={styles.itemAction}>
                <Text style={styles.deleteText}>{deletingId === item.id ? "Deleting…" : "Delete"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          <Link href="/connection" asChild>
            <Pressable accessibilityRole="button" style={styles.connectionLink}>
              <Text style={styles.linkText}>Check server connection</Text>
            </Pressable>
          </Link>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { flexGrow: 1, padding: 24 },
  header: { gap: 12, marginBottom: 18 },
  title: { color: "#244c38", fontSize: 34, fontWeight: "700" },
  email: { color: "#465a4d", fontSize: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: { borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  actionText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  addAction: { backgroundColor: "#35644f" },
  addActionText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  notice: { color: "#244c38", fontSize: 15, lineHeight: 21 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  empty: { color: "#465a4d", fontSize: 17, paddingVertical: 20 },
  item: { backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 12, borderWidth: 1, marginBottom: 10, padding: 16 },
  itemName: { color: "#244c38", fontSize: 17, fontWeight: "600" },
  itemDetail: { color: "#465a4d", fontSize: 15, marginTop: 4 },
  itemActions: { flexDirection: "row", gap: 16, marginTop: 10 },
  itemAction: { minHeight: 40, justifyContent: "center", paddingHorizontal: 2 },
  deleteText: { color: "#a12f2f", fontSize: 16, fontWeight: "600" },
  connectionLink: { alignSelf: "flex-start", marginTop: 14, paddingVertical: 10 },
  linkText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
});
