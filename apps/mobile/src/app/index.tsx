import { useAuth } from "@/auth/session";
import PantryScreen from "@/components/PantryScreen";
import SignInScreen from "@/components/SignInScreen";

export default function HomeScreen() {
  const { session } = useAuth();
  return session ? <PantryScreen session={session} /> : <SignInScreen />;
}
