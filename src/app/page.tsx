"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { BoardView } from "@/components/board-view";
import type { BoardState, CodexAuthStatus } from "@/lib/types";

export default function Home() {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [auth, setAuth] = useState<CodexAuthStatus | null>(null);
  const [deviceLogin, setDeviceLogin] = useState<{
    loginId: string;
    verificationUrl: string;
    userCode: string;
    mode: "mock" | "codex";
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mutation, setMutation] = useState("");
  const [busy, setBusy] = useState(false);
  const activeTurn = board?.turns.find((turn) => turn.status === "pending") ?? null;
  const latestTurn = board?.turns.at(-1) ?? null;

  useEffect(() => {
    void refreshAuth();
    void fetch("/api/boards")
      .then((response) => response.json())
      .then((data: { boards: BoardState[] }) => {
        if (data.boards[0]) {
          setBoard(data.boards[0]);
        }
      });
  }, []);

  useEffect(() => {
    if (!deviceLogin || auth?.connected) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshAuth();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [auth?.connected, deviceLogin]);

  useEffect(() => {
    if (!board?.id || !activeTurn) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshBoard(board.id);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeTurn, board?.id]);

  const counts = useMemo(() => {
    if (!board) {
      return { total: 0, ready: 0, failed: 0 };
    }
    const items = Object.values(board.items);
    return {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      failed: items.filter((item) => item.status === "failed").length,
    };
  }, [board]);

  async function refreshAuth() {
    const response = await fetch("/api/auth/codex/status", { cache: "no-store" });
    setAuth(await response.json());
  }

  async function refreshBoard(boardId: string) {
    const response = await fetch(`/api/boards/${boardId}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { board: BoardState };
    setBoard(data.board);
  }

  async function startDeviceLogin() {
    const response = await fetch("/api/auth/codex/start-device-login", {
      method: "POST",
    });
    const data = await response.json();
    setDeviceLogin(data);
    await refreshAuth();
  }

  async function createBoard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      setBoard(data.board);
      setPrompt("");
    } finally {
      setBusy(false);
    }
  }

  async function submitMutation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board || !mutation.trim()) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/boards/${board.id}/mutations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: mutation }),
      });
      const data = await response.json();
      setBoard(data.board);
      setMutation("");
    } finally {
      setBusy(false);
    }
  }

  async function retryImage(itemId: string) {
    if (!board) {
      return;
    }
    const response = await fetch(`/api/boards/${board.id}/items/${itemId}/retry-image`, {
      method: "POST",
    });
    const data = await response.json();
    setBoard(data.board);
  }

  async function persistPlacements(nextBoard: BoardState) {
    setBoard(nextBoard);
    await fetch(`/api/boards/${nextBoard.id}/placements`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tiers: nextBoard.tiers.map((tier) => ({ id: tier.id, itemIds: tier.itemIds })),
        trayItemIds: nextBoard.trayItemIds,
      }),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!board || !event.over) {
      return;
    }
    const itemId = String(event.active.id);
    const destination = String(event.over.id);
    const validDestinations = new Set([
      "tray",
      ...board.tiers.map((tier) => tier.id),
    ]);
    if (!validDestinations.has(destination)) {
      return;
    }

    const nextBoard: BoardState = {
      ...board,
      trayItemIds: board.trayItemIds.filter((id) => id !== itemId),
      tiers: board.tiers.map((tier) => ({
        ...tier,
        itemIds: tier.itemIds.filter((id) => id !== itemId),
      })),
    };

    if (destination === "tray") {
      nextBoard.trayItemIds = [...nextBoard.trayItemIds, itemId];
    } else {
      nextBoard.tiers = nextBoard.tiers.map((tier) =>
        tier.id === destination
          ? { ...tier, itemIds: [...tier.itemIds, itemId] }
          : tier,
      );
    }

    void persistPlacements(nextBoard);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Tier List Gen</h1>
          <p>{activeTurn ? activeTurn.detail ?? "Working on the board..." : "Generate the set, rank it yourself, patch it as you go."}</p>
        </div>
        <div className="auth-pill">
          ChatGPT/Codex: <strong>{auth?.connected ? "connected" : auth?.mode ?? "mock"}</strong>
        </div>
      </header>

      <section className="workspace">
        <section className="creator">
          <form onSubmit={createBoard}>
            <input
              aria-label="Tier list prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="make a tier list of cheeses"
              disabled={Boolean(activeTurn)}
            />
            <button disabled={busy || Boolean(activeTurn) || !prompt.trim()} type="submit">
              {busy ? "Queueing" : "Generate"}
            </button>
          </form>
        </section>

        <DndContext onDragEnd={handleDragEnd}>
          <section className="layout">
            <section className="board-panel">
              {board ? (
                <>
                  <div className="board-header">
                    <h2>{board.title}</h2>
                    <div className="board-meta">{activeTurn ? activeTurn.phase ?? "working" : `${counts.total} items`}</div>
                  </div>
                  {activeTurn && counts.total === 0 ? (
                    <div className="generation-state">
                      <div className="spinner" />
                      <div>
                        <strong>{activeTurn.phase ?? "working"}</strong>
                        <p>{activeTurn.detail ?? "Waiting for the generator."}</p>
                      </div>
                    </div>
                  ) : null}
                  <BoardView board={board} onRetryImage={retryImage} />
                </>
              ) : (
                <div className="empty-board">
                  Create a board to start ranking.
                </div>
              )}
            </section>

            <aside className="side-panel">
              <h3>Mutation</h3>
              <form className="mutation-form" onSubmit={submitMutation}>
                <input
                  aria-label="Board mutation"
                  value={mutation}
                  onChange={(event) => setMutation(event.target.value)}
                  placeholder="add cheddar and remove parm"
                  disabled={!board || Boolean(activeTurn)}
                />
                <button disabled={busy || Boolean(activeTurn) || !board || !mutation.trim()} type="submit">
                  {busy ? "Queueing" : "Apply"}
                </button>
              </form>

              <h3>Status</h3>
              <ul className="status-list">
                <li>
                  <span>Ready</span>
                  <strong>{counts.ready}</strong>
                </li>
                <li>
                  <span>Failed</span>
                  <strong>{counts.failed}</strong>
                </li>
                <li>
                  <span>Quality</span>
                  <strong>{board?.desiredImageQuality ?? "low"}</strong>
                </li>
                <li>
                  <span>Worker</span>
                  <strong>{activeTurn ? "active" : "idle"}</strong>
                </li>
              </ul>

              <h3>Activity</h3>
              <ul className="activity-list">
                {(board?.turns.slice(-4).reverse() ?? []).map((turn) => (
                  <li key={turn.id} className={`activity-item ${turn.status}`}>
                    <div>
                      <strong>{turn.phase ?? turn.status}</strong>
                      <span>{turn.detail ?? turn.input}</span>
                      {turn.error ? <code>{turn.error}</code> : null}
                    </div>
                  </li>
                ))}
                {!board ? <li className="activity-empty">No board activity yet.</li> : null}
              </ul>

              <h3>ChatGPT auth</h3>
              <button className="connect-button" type="button" onClick={startDeviceLogin} disabled={Boolean(activeTurn)}>
                Start device login
              </button>
              <p className="auth-detail">{auth?.detail}</p>
              {deviceLogin ? (
                <div className="device-card">
                  <span>{deviceLogin.mode === "mock" ? "Mock device flow" : "Device code"}</span>
                  <code>{deviceLogin.userCode}</code>
                  <a href={deviceLogin.verificationUrl} target="_blank">
                    Open verification
                  </a>
                </div>
              ) : null}
            </aside>
          </section>
        </DndContext>
      </section>
    </main>
  );
}
