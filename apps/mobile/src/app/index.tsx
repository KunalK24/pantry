import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import SignInScreen from "@/components/SignInScreen";

export default function HomeScreen() {
  const { session } = useAuth();
  return session ? <Redirect href="/recipes" /> : <SignInScreen />;
}
