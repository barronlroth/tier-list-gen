import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("@/lib/db", () => ({
  getLists: vi.fn().mockResolvedValue([]),
  saveList: vi.fn().mockResolvedValue(undefined),
  deleteList: vi.fn().mockResolvedValue(undefined),
}));

describe("home", () => {
  it("opens directly into the list builder", () => {
    render(<Home />);
    expect(screen.getByLabelText("List topic")).toBeVisible();
    expect(screen.queryByLabelText("Access code")).not.toBeInTheDocument();
  });
});
