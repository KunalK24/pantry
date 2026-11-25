import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/auth/session";
import RecipeDetailScreen from "@/components/RecipeDetailScreen";

export default function RecipeRoute() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!session) return <Redirect href="/" />;
  return <RecipeDetailScreen id={typeof id === "string" ? id : ""} key={`${session.user.id}:${session.expiresAt}:${id}`} session={session} />;
}
