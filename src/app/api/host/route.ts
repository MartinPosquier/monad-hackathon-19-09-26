import { serverConfig } from "@/server/config";
import { getLobby } from "@/server/game";
import { handle, HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

function requireHost(req: Request) {
  const expected = serverConfig().hostToken;
  if (!expected) throw new HttpError(503, "HOST_TOKEN is not configured");
  if (req.headers.get("x-host-token") !== expected) throw new HttpError(401, "invalid host token");
}

/** Vérifie le jeton hôte (affiche ou non le bouton Start now). */
export function GET(req: Request) {
  return handle(() => {
    requireHost(req);
    return { host: true };
  });
}

/** « Start now » : lance la course ouverte sans attendre la fin du compte à rebours. */
export function POST(req: Request) {
  return handle(() => {
    requireHost(req);
    return getLobby().hostStart();
  });
}
