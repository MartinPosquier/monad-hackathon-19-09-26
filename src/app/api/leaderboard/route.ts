import { getLobby } from "@/server/game";
import { handle } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => {
    const lobby = getLobby();
    return { players: lobby.leaderboard(), recent: lobby.lobby().recent };
  });
}
