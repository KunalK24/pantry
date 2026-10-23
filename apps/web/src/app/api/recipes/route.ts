import {
  MAX_JSON_REQUEST_BYTES,
  readBoundedJson,
  RequestTooLargeError,
} from "@/lib/request-json";
import { createRecipe, listRecipes } from "@/services/recipe-service";
import { recipeInputSchema } from "@/schemas/recipe";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
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
    return Response.json(
      {
        error: "Malformed JSON",
      },
      {
        status: 400,
      },
    );
  }

  const result = recipeInputSchema.safeParse(input);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid Recipe",
        details: result.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  try {
    const recipe = await createRecipe(auth.user.id, result.data);

    return Response.json(recipe, {
      status: 201,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: "Internal Server Error",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const recipes = await listRecipes(auth.user.id);

    return Response.json({ recipes });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error: "Internal Server Error",
      },
      {
        status: 500,
      },
    );
  }
}
