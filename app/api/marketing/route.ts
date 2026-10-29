import {
  currentPeriod,
  generateIdeas,
  generateSchema,
  marketingContext,
  marketingError,
  MarketingError,
  opportunities,
} from "@/lib/marketing/server";
export const runtime = "nodejs";
export const maxDuration = 240;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const ctx = await marketingContext(),
      p = new URL(request.url).searchParams,
      defaults = currentPeriod();
    return Response.json(
      await opportunities(ctx, {
        from: p.get("from") ?? defaults.from,
        to: p.get("to") ?? defaults.to,
      }),
      { headers },
    );
  } catch (error) {
    return marketingError(error);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new MarketingError("Origen de solicitud no permitido.", 403);
    const ctx = await marketingContext(),
      text = await request.text();
    if (text.length > 20000)
      throw new MarketingError("Solicitud demasiado grande.", 413);
    return Response.json(
      await generateIdeas(ctx, generateSchema.parse(JSON.parse(text))),
      { headers },
    );
  } catch (error) {
    return marketingError(error);
  }
}
