import { getLobby } from "@/server/game";
import { handle, HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const race = getLobby().race(id);
    if (!race) throw new HttpError(404, "race not found");
    return race;
  });
}
