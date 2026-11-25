import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import CreateRecipeScreen from "@/components/CreateRecipeScreen";

export default function NewRecipeRoute() {
  const { session } = useAuth();
  return session ? <CreateRecipeScreen session={session} /> : <Redirect href="/" />;
}
