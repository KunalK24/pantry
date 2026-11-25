import { checkNativeRequestOrigin, getBearerSessionToken } from "@/lib/auth";
import { signOut } from "@/services/auth-service";

export async function POST(request: Request) {
  const token = getBearerSessionToken(request);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const originResponse = checkNativeRequestOrigin(request);
  if (originResponse) {
    return originResponse;
  }

  try {
    await signOut(token);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
