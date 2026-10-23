import {
  MAX_JSON_REQUEST_BYTES,
  readBoundedJson,
  RequestTooLargeError,
} from "@/lib/request-json";
import { groceryListInputSchema } from "@/schemas/grocery-list";
import { requireAuth } from "@/lib/auth";
import {
  clearActiveGroceryList,
  getActiveGroceryList,
  GroceryListReferenceError,
  saveActiveGroceryList,
} from "@/services/grocery-list-service";

function internalServerErrorResponse(error: unknown) {
  console.error(error);

  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const list = await getActiveGroceryList(auth.user.id);
    return Response.json({ list });
  } catch (error) {
    return internalServerErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth(request);

  if (auth.response) {
    return auth.response;
  }

  let input: unknown;

  try {
    input = await readBoundedJson(request, MAX_JSON_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json(
        { error: "Request body is too large" },
        { status: 413 },
      );
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const inputResult = groceryListInputSchema.safeParse(input);

  if (!inputResult.success) {
    return Response.json(
      {
        error: "Invalid grocery list",
        details: inputResult.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const list = await saveActiveGroceryList(auth.user.id, inputResult.data);
    return Response.json({ list });
  } catch (error) {
    if (error instanceof GroceryListReferenceError) {
      return Response.json(
        { error: "Grocery list references an unknown record" },
        { status: 400 },
      );
    }

    return internalServerErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    await clearActiveGroceryList(auth.user.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return internalServerErrorResponse(error);
  }
}
