import { requireAuth } from "@/lib/auth";
import {
  MAX_JSON_REQUEST_BYTES,
  readBoundedJson,
  RequestTooLargeError,
} from "@/lib/request-json";
import { groceryListNameSchema } from "@/schemas/named-grocery-list";
import { createGroceryList, listGroceryLists } from "@/services/named-grocery-list-service";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}

  try {
    return Response.json({ lists: await listGroceryLists(auth.user.id) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_JSON_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json({ error: "Request body is too large" }, { status: 413 });
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = groceryListNameSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid grocery list name" }, { status: 400 });
  }

  try {
    const list = await createGroceryList(auth.user.id, parsed.data.name);
    return Response.json({ list }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
