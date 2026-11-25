import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import PantryScreen from "@/components/PantryScreen";

export default function PantryRoute() {
  const { session } = useAuth();
  return session ? <PantryScreen session={session} /> : <Redirect href="/" />;
}
