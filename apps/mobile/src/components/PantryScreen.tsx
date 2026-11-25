import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getJson } from "@/api/client";
import { useAuth, type Session } from "@/auth/session";

type PantryItem = { id: string; name: string; quantity: string | null; unit: string | null };
type PantryResponse = { items: PantryItem[] };

function isPantryResponse(value: unknown): value is PantryResponse {
  return typeof value === "object" && value !== null && "items" in value &&
    Array.isArray(value.items) && value.items.every((item: unknown) =>
      typeof item === "object" && item !== null &&
      "id" in item && typeof item.id === "string" &&
      "name" in item && typeof item.name === "string" &&
      "quantity" in item && (typeof item.quantity === "string" || item.quantity === null) &&
      "unit" in item && (typeof item.unit === "string" || item.unit === null));
}

export default function PantryScreen({ session }: { session: Session }) {
  const { clearSession, signOut } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Your pantry</Text>
            <Text style={styles.email}>{session.user.email}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={styles.action}>
                <Text style={styles.actionText}>Refresh</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => void handleSignOut()} style={styles.action}>
                <Text style={styles.actionText}>Sign out</Text>
              </Pressable>
            </View>
            {loading ? <ActivityIndicator accessibilityLabel="Loading pantry" color="#35644f" /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Your pantry is empty.</Text> : undefined}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.quantity || item.unit ? (
              <Text style={styles.itemDetail}>{[item.quantity, item.unit].filter(Boolean).join(" ")}</Text>
            ) : null}
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
  actions: { flexDirection: "row", gap: 12 },
  action: { borderColor: "#35644f", borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  actionText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  empty: { color: "#465a4d", fontSize: 17, paddingVertical: 20 },
  item: { backgroundColor: "#ffffff", borderColor: "#e1e7df", borderRadius: 12, borderWidth: 1, marginBottom: 10, padding: 16 },
  itemName: { color: "#244c38", fontSize: 17, fontWeight: "600" },
  itemDetail: { color: "#465a4d", fontSize: 15, marginTop: 4 },
  connectionLink: { alignSelf: "flex-start", marginTop: 14, paddingVertical: 10 },
  linkText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
});
