import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { MarkOutOfStep } from "../MarkOutOfStep";
afterEach(() => { cleanup(); signOutLocalAccount(); });
it("discards stale pantry completion before global navigation", async () => {
  selectVerifiedAccount("a"); let finish!: () => void; const onDone = vi.fn();
  render(<MarkOutOfStep ingredientNames={["bread"]} pantry={[{ id: "bread", name: "bread", status: "in_stock", created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", notes: null, aisle: "Bakery", aisle_overridden: false }]} onSetPantryStatus={() => new Promise<void>((resolve) => { finish = resolve; })} onDone={onDone} />);
  fireEvent.click(screen.getByRole("button", { name: "Used it up" })); fireEvent.click(screen.getByRole("button", { name: "Save & finish" }));
  signOutLocalAccount(); selectVerifiedAccount("b"); await act(async () => { finish(); }); expect(onDone).not.toHaveBeenCalled();
});
