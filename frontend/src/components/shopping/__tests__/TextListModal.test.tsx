import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextListModal } from "../TextListModal";
import * as api from "@/lib/api";

describe("TextListModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the phone input and send button", () => {
    render(<TextListModal onClose={() => {}} />);
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send text/i })
    ).toBeInTheDocument();
  });

  it("sends the list and shows a success message", async () => {
    const spy = vi
      .spyOn(api, "textShoppingList")
      .mockResolvedValue({ sent_to: "+15551234567", item_count: 3 });

    render(<TextListModal onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/phone number/i),
      "555-123-4567"
    );
    await userEvent.click(screen.getByRole("button", { name: /send text/i }));

    expect(spy).toHaveBeenCalledWith("555-123-4567");
    expect(await screen.findByText(/sent 3 items to/i)).toBeInTheDocument();
  });

  it("remembers a number after a successful send", async () => {
    vi.spyOn(api, "textShoppingList").mockResolvedValue({
      sent_to: "+15551234567",
      item_count: 1,
    });

    const { unmount } = render(<TextListModal onClose={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/phone number/i),
      "+15551234567"
    );
    await userEvent.click(screen.getByRole("button", { name: /send text/i }));
    await screen.findByText(/sent 1 item to/i);
    unmount();

    // Re-mounting surfaces the remembered number as a quick-pick chip.
    render(<TextListModal onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: "+15551234567" })
    ).toBeInTheDocument();
  });

  it("shows an error when sending fails", async () => {
    vi.spyOn(api, "textShoppingList").mockRejectedValue(
      new Error("Texting only works when the app runs on a signed-in Mac.")
    );

    render(<TextListModal onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/phone number/i), "+15551234567");
    await userEvent.click(screen.getByRole("button", { name: /send text/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/texting only works when the app runs/i)
      ).toBeInTheDocument()
    );
  });
});
