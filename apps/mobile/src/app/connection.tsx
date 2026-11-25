import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getJson } from "@/api/client";
import { getApiBaseUrl } from "@/config";

type HealthResponse = { status: "ok" };
type HealthState =
  | { kind: "loading" }
  | { kind: "connected" }
  | { kind: "error"; message: string };

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === "object" && value !== null && "status" in value && value.status === "ok";
}

export default function ConnectionScreen() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  async function checkConnection() {
    try {
      await getJson("/api/health", isHealthResponse);
      setState({ kind: "connected" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to check the server. Please try again.",
      });
    }
  }

  useEffect(() => {
    let active = true;
    getJson("/api/health", isHealthResponse).then(
      () => {
        if (active) setState({ kind: "connected" });
      },
      (error: unknown) => {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Unable to check the server. Please try again.",
          });
        }
      },
    );
    return () => { active = false; };
  }, []);

  let baseUrl: string;
  try {
    baseUrl = getApiBaseUrl();
  } catch (error) {
    baseUrl = error instanceof Error ? error.message : "Not configured";
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Link href="/" asChild>
          <Pressable accessibilityRole="button" style={styles.backLink}>
            <Text style={styles.backText}>‹ Back to Pantry</Text>
          </Pressable>
        </Link>
        <Text style={styles.heading}>Server connection</Text>
        <Text style={styles.description}>API: {baseUrl}</Text>
        {state.kind === "loading" ? (
          <View style={styles.status}>
            <ActivityIndicator color="#35644f" />
            <Text style={styles.description}>Checking Pantry…</Text>
          </View>
        ) : state.kind === "connected" ? (
          <Text accessibilityRole="alert" style={styles.success}>Connected to Pantry.</Text>
        ) : (
          <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={state.kind === "loading"}
          onPress={() => {
            setState({ kind: "loading" });
            void checkConnection();
          }}
          style={[styles.button, state.kind === "loading" && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { flex: 1, padding: 24, gap: 18 },
  backLink: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
  heading: { color: "#244c38", fontSize: 28, fontWeight: "700" },
  description: { color: "#37483e", fontSize: 16, lineHeight: 23 },
  status: { alignItems: "center", flexDirection: "row", gap: 12 },
  success: { color: "#24583a", fontSize: 17, fontWeight: "600" },
  error: { color: "#a12f2f", fontSize: 16, lineHeight: 23 },
  button: {
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: "#35644f",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
