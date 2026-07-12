import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("@/lib/db", () => ({
  getLists: vi.fn().mockResolvedValue([]),
  saveList: vi.fn().mockResolvedValue(undefined),
  deleteList: vi.fn().mockResolvedValue(undefined),
}));

describe("access gate", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders immediately before browser access is restored", () => {
    render(<Home />);
    expect(screen.getByLabelText("Access code")).toBeVisible();
  });

  it("opens the app with the demo code", () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "demo" } });
    fireEvent.click(screen.getByRole("button", { name: /enter the arena/i }));
    expect(screen.getByLabelText("List topic")).toBeVisible();
  });
});
