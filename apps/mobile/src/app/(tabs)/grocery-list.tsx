import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import GroceryListScreen from "../../components/GroceryListScreen";

export default function GroceryListRoute() {
  const { session } = useAuth();
  return session ? <GroceryListScreen session={session} /> : <Redirect href="/" />;
}
