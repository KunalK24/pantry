import { type AccessRequestInput } from "@/schemas/access-request";

export class AccessRequestDeliveryError extends Error {
  constructor() {
    super("Access request notification unavailable");
    this.name = "AccessRequestDeliveryError";
  }
}

export async function sendAccessRequest(input: AccessRequestInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCESS_REQUEST_FROM_EMAIL;
  const to = process.env.ACCESS_REQUEST_TO_EMAIL;
  if (!apiKey || !from || !to) {
    throw new AccessRequestDeliveryError();
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Pantry access request",
        text: `Name: ${input.name}\nEmail: ${input.email}\n\nWhy they want to test Pantry:\n${input.reason}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("Access request notification failed", error);
    throw new AccessRequestDeliveryError();
  }

  if (!response.ok) {
    console.error("Access request notification rejected", { status: response.status });
    await response.body?.cancel().catch(() => undefined);
    throw new AccessRequestDeliveryError();
  }
  await response.body?.cancel().catch(() => undefined);
}
