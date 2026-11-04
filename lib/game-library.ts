import type { LibraryDocument, LibraryOperation } from "./library-state";
import { cleanGameSnapshot, isRemoteGameId } from "./gaming-state";
import { igdbGameDetails } from "./igdb";

// Only server-fetched public metadata is committed for newly saved remote IDs.
// Previously saved metadata keeps progress updates/removal working during outages.
export async function verifyGameOperations(document: LibraryDocument, operations: LibraryOperation[]): Promise<LibraryOperation[]> {
  const needed = [...new Set(operations.filter(op => op.type === "game-status" && op.value && isRemoteGameId(op.id) && !cleanGameSnapshot(document.gameDetails?.[op.id]))
    .map(op => (op as Extract<LibraryOperation, { type: "game-status" }>).id))];
  const fetched = await igdbGameDetails(needed);
  return operations.map(op => {
    if (op.type !== "game-status" || !op.value || !isRemoteGameId(op.id)) return op;
    const game = cleanGameSnapshot(document.gameDetails?.[op.id]) || fetched.get(op.id);
    if (!game) throw Error("This game could not be verified. Search for it again before saving.");
    return { ...op, game };
  });
}
