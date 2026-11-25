import { Redirect, Tabs } from "expo-router";

import { useAuth } from "@/auth/session";

export default function TabLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: "#35644f",
      tabBarInactiveTintColor: "#526354",
      tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      tabBarStyle: { backgroundColor: "#f7f6f1", borderTopColor: "#d8e4d9" },
    }}>
      <Tabs.Screen name="recipes" options={{ title: "Recipe book" }} />
      <Tabs.Screen name="meal-planner" options={{ title: "Meal plan" }} />
      <Tabs.Screen name="pantry" options={{ title: "Pantry" }} />
      <Tabs.Screen name="grocery-list" options={{ title: "Groceries" }} />
    </Tabs>
  );
}
