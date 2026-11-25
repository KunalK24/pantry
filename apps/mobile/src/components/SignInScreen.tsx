import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/session";

export default function SignInScreen() {
  const { signIn, signOutNotice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Pantry</Text>
          <Text style={styles.subtitle}>Sign in to see what’s in your kitchen.</Text>
          {signOutNotice ? (
            <Text
              accessibilityRole="alert"
              style={signOutNotice.kind === "unconfirmed" ? styles.error : styles.notice}
            >
              {signOutNotice.message}
            </Text>
          ) : null}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              style={styles.input}
              textContentType="username"
              value={email}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoComplete="password"
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void submit()}
              style={[styles.button, submitting && styles.disabled]}
            >
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
          </View>
          <Link href="/connection" asChild>
            <Pressable accessibilityRole="button" style={styles.connectionLink}>
              <Text style={styles.linkText}>Check server connection</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#f7f6f1" },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { color: "#244c38", fontSize: 38, fontWeight: "700" },
  subtitle: { color: "#37483e", fontSize: 17, lineHeight: 25 },
  form: { gap: 10, marginTop: 22 },
  label: { color: "#244c38", fontSize: 15, fontWeight: "600" },
  input: { backgroundColor: "#ffffff", borderColor: "#cbd5cb", borderWidth: 1, borderRadius: 12, fontSize: 17, minHeight: 52, paddingHorizontal: 14 },
  error: { color: "#a12f2f", fontSize: 15, lineHeight: 21 },
  notice: { color: "#244c38", fontSize: 15, lineHeight: 21 },
  button: { alignItems: "center", backgroundColor: "#35644f", borderRadius: 12, justifyContent: "center", marginTop: 10, minHeight: 52 },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  connectionLink: { alignSelf: "flex-start", marginTop: 12, paddingVertical: 10 },
  linkText: { color: "#35644f", fontSize: 16, fontWeight: "600" },
});
