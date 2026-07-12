import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  process.env.GEMINI_API_KEY = originalKey;
});

describe("item generation route", () => {
  it("adds five unique demo contenders around the existing list", async () => {
    delete process.env.GEMINI_API_KEY;
    const existing = ["French fries", "Tater tots", "Mashed potatoes"];
    const response = await POST(new Request("http://localhost/api/items", {
      method: "POST",
      body: JSON.stringify({ topic: "potato dishes", existing, count: 5 }),
    }));
    const body = await response.json();

    expect(body.items).toHaveLength(5);
    expect(body.items.map((item: string) => item.toLowerCase())).not.toContain("french fries");
  });

  it("can expand an existing list beyond thirty items", async () => {
    delete process.env.GEMINI_API_KEY;
    const existing = Array.from({ length: 29 }, (_, index) => `Existing ${index}`);
    const response = await POST(new Request("http://localhost/api/items", {
      method: "POST",
      body: JSON.stringify({ topic: "films", existing, count: 5 }),
    }));
    const body = await response.json();

    expect(body.items).toHaveLength(5);
  });
});
