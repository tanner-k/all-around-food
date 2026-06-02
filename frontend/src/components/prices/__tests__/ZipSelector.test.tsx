import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZipSelector } from "../ZipSelector";

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = {
  toString: () => "",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

function setup(currentZip = "") {
  const user = userEvent.setup();
  const utils = render(<ZipSelector currentZip={currentZip} />);
  const input = screen.getByRole("textbox", { name: /zip code/i });
  const button = screen.getByRole("button", { name: /set zip/i });
  return { user, input, button, ...utils };
}

describe("ZipSelector", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders input and submit button", () => {
    setup();
    expect(screen.getByRole("textbox", { name: /zip code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set zip/i })).toBeInTheDocument();
  });

  it("pre-fills from currentZip prop", () => {
    setup("84065");
    expect(screen.getByRole("textbox", { name: /zip code/i })).toHaveValue("84065");
  });

  it("calls router.push with the ZIP in search params on valid submit", async () => {
    const { user, input, button } = setup();
    await user.clear(input);
    await user.type(input, "90210");
    await user.click(button);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("zip=90210"));
  });

  it("shows validation error and does not navigate for non-5-digit input", async () => {
    const { user, input, button } = setup();
    await user.clear(input);
    await user.type(input, "123");
    await user.click(button);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("strips non-numeric characters from input", async () => {
    const { user, input } = setup();
    await user.clear(input);
    await user.type(input, "abc12345");
    // only digits, max 5
    expect(input).toHaveValue("12345");
  });

  it("shows error for completely non-numeric input on submit", async () => {
    const { user, button } = setup();
    // Input stays empty since non-numeric chars are stripped
    await user.click(button);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
