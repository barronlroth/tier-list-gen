import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoardState } from "@/lib/types";

const DATA_DIR = process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data");
const BOARD_DIR = path.join(DATA_DIR, "boards");

export async function listBoards(ownerId: string) {
  await ensureStore();
  const files = await readdir(BOARD_DIR);
  const boards = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => readBoardFile(path.join(BOARD_DIR, file))),
  );

  return boards
    .filter((board) => board.ownerId === ownerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBoard(ownerId: string, boardId: string) {
  await ensureStore();
  const board = await readBoardFile(boardPath(boardId));
  if (board.ownerId !== ownerId) {
    throw new Error("Board not found");
  }
  return board;
}

export async function saveBoard(board: BoardState) {
  await ensureStore();
  await writeFile(boardPath(board.id), JSON.stringify(board, null, 2));
  return board;
}

export async function updateBoard(
  ownerId: string,
  boardId: string,
  updater: (board: BoardState) => BoardState,
) {
  const board = await getBoard(ownerId, boardId);
  return await saveBoard(updater(board));
}

async function ensureStore() {
  await mkdir(BOARD_DIR, { recursive: true });
}

async function readBoardFile(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as BoardState;
}

function boardPath(boardId: string) {
  return path.join(BOARD_DIR, `${boardId}.json`);
}
