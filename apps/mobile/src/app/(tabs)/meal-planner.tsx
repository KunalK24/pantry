import { Redirect } from "expo-router";

import { useAuth } from "@/auth/session";
import MealPlannerScreen from "@/components/MealPlannerScreen";

export default function MealPlannerRoute() {
  const { session } = useAuth();
  return session ? <MealPlannerScreen key={`${session.user.id}:${session.expiresAt}`} session={session} /> : <Redirect href="/" />;
}
