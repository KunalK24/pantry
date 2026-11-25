import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/auth/session";
import EditRecipeScreen from "@/components/EditRecipeScreen";

export default function EditRecipeRoute() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!session) return <Redirect href="/" />;
  return <EditRecipeScreen id={typeof id === "string" ? id : ""} key={`${session.user.id}:${session.expiresAt}:${id}`} session={session} />;
}
