import { z } from "zod";
import {
  marketingContext,
  marketingError,
  MarketingError,
} from "@/lib/marketing/server";
import {
  listIdeas,
  saveIdea,
  saveSchema,
  editSavedIdea,
  editSchema,
} from "@/lib/marketing/storage";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const ctx = await marketingContext(),
      page = z.coerce
        .number()
        .int()
        .min(0)
        .max(500)
        .parse(new URL(request.url).searchParams.get("page") ?? 0);
    return Response.json(await listIdeas(ctx, page), { headers });
  } catch (e) {
    return marketingError(e);
  }
}
async function write(request: Request, edit: boolean) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new MarketingError("Origen no permitido.", 403);
    const ctx = await marketingContext(),
      body = await request.text();
    if (body.length > 60000)
      throw new MarketingError("Solicitud demasiado grande.", 413);
    return Response.json(
      edit
        ? await editSavedIdea(ctx, editSchema.parse(JSON.parse(body)))
        : await saveIdea(ctx, saveSchema.parse(JSON.parse(body))),
      { headers },
    );
  } catch (e) {
    return marketingError(e);
  }
}
export const POST = (r: Request) => write(r, false);
export const PATCH = (r: Request) => write(r, true);
