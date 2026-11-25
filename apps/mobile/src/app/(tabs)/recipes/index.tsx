import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import RecipesScreen from "@/components/RecipesScreen";

export default function RecipesRoute() {
  const { session } = useAuth();
  return session ? <RecipesScreen session={session} /> : <Redirect href="/" />;
}
