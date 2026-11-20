import { requireAuth } from "@/lib/auth";
import {
  MAX_JSON_REQUEST_BYTES,
  readBoundedJson,
  RequestTooLargeError,
} from "@/lib/request-json";
import { groceryListInputSchema } from "@/schemas/grocery-list";
import { groceryListIdSchema, groceryListNameSchema } from "@/schemas/named-grocery-list";
import {
  deleteGroceryList,
  getGroceryList,
  NamedGroceryListNotFoundError,
  NamedGroceryListReferenceError,
  renameGroceryList,
  saveGroceryList,
} from "@/services/named-grocery-list-service";

type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext) {
  return groceryListIdSchema.safeParse((await context.params).id);
}

function errorResponse(error: unknown) {
  if (error instanceof NamedGroceryListNotFoundError) {
    return Response.json({ error: "Grocery list not found" }, { status: 404 });
  }
  if (error instanceof NamedGroceryListReferenceError) {
    return Response.json({ error: "Grocery list references an unknown record" }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}

async function readBody(request: Request): Promise<{ body?: unknown; response?: Response }> {
  try {
    return { body: await readBoundedJson(request, MAX_JSON_REQUEST_BYTES) };
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return { response: Response.json({ error: "Request body is too large" }, { status: 413 }) };
    }
    return { response: Response.json({ error: "Malformed JSON" }, { status: 400 }) };
  }
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}
  const id = await readId(context);
  if (!id.success) {return Response.json({ error: "Grocery list not found" }, { status: 404 });}

  try {
    const list = await getGroceryList(auth.user.id, id.data);
    if (!list) {return Response.json({ error: "Grocery list not found" }, { status: 404 });}
    return Response.json({ list });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}
  const id = await readId(context);
  if (!id.success) {return Response.json({ error: "Grocery list not found" }, { status: 404 });}
  const payload = await readBody(request);
  if (payload.response) {return payload.response;}
  const parsed = groceryListInputSchema.safeParse(payload.body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid grocery list", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return Response.json({ list: await saveGroceryList(auth.user.id, id.data, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}
  const id = await readId(context);
  if (!id.success) {return Response.json({ error: "Grocery list not found" }, { status: 404 });}
  const payload = await readBody(request);
  if (payload.response) {return payload.response;}
  const parsed = groceryListNameSchema.safeParse(payload.body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid grocery list name" }, { status: 400 });
  }

  try {
    return Response.json({ list: await renameGroceryList(auth.user.id, id.data, parsed.data.name) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.response) {return auth.response;}
  const id = await readId(context);
  if (!id.success) {return Response.json({ error: "Grocery list not found" }, { status: 404 });}

  try {
    await deleteGroceryList(auth.user.id, id.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
