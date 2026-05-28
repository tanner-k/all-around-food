import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvalTable } from "../EvalTable";
import type { Evaluation } from "@/lib/eval-schema";

const EVAL: Evaluation = {
  id: "ev-001",
  created_at: "2025-05-01T10:00:00Z",
  source_kind: "url",
  source_ref: "https://example.com/recipe/pasta",
  worker_model: "claude-sonnet-4-6",
  worker_prompt: "Extract recipe",
  worker_output: "{}",
  worker_parse_confidence: 0.95,
  judge_model: "claude-opus-4-5",
  judge_prompt: "Evaluate",
  overall_grade: 8,
  accuracy_grade: 7,
  completeness_grade: 9,
  strengths: ["Clear instructions", "Good ingredient list"],
  weaknesses: ["Missing cook time"],
  field_checks: [
    { field: "title", issue: "fine", detail: "Present and correct" },
  ],
  reasoning: "Overall a solid extraction.",
  suggested_prompt_improvements: null,
  raw_judge_output: "{}",
};

describe("EvalTable", () => {
  it("renders empty state", () => {
    render(<EvalTable evaluations={[]} />);
    expect(screen.getByText(/no evaluations yet/i)).toBeInTheDocument();
  });

  it("renders grade chips for overall, accuracy, and completeness", () => {
    render(<EvalTable evaluations={[EVAL]} />);
    // GradeChip renders "X/10" — both trees render, so expect multiple occurrences.
    expect(screen.getAllByText("8/10").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("7/10").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("9/10").length).toBeGreaterThanOrEqual(1);
  });

  it("renders source ref in both table row and card (both DOM trees present)", () => {
    render(<EvalTable evaluations={[EVAL]} />);
    // JSDOM doesn't enforce CSS breakpoints — both trees render in DOM.
    // "https://example.com/recipe/pasta" is 32 chars — no truncation.
    const matches = screen.getAllByText(/example\.com\/recipe\/pasta/i);
    // Expect at least 2: one in the desktop grid row, one in the mobile card.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("expands detail panel on click", async () => {
    const user = userEvent.setup();
    render(<EvalTable evaluations={[EVAL]} />);

    // Both desktop row and mobile card buttons are in the DOM.
    // Click the first button (desktop row).
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    // Both expanded panels render simultaneously (shared state + both trees visible in JSDOM).
    expect(screen.getAllByText("Overall a solid extraction.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Clear instructions").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Missing cook time").length).toBeGreaterThanOrEqual(1);
  });

  it("renders date in both trees", () => {
    render(<EvalTable evaluations={[EVAL]} />);
    // formatDate produces e.g. "May 1, 04:00 AM" — check month/day presence
    const dateMatches = screen.getAllByText(/May 1/);
    expect(dateMatches.length).toBeGreaterThanOrEqual(2);
  });
});
