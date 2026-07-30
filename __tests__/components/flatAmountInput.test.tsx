// @vitest-environment jsdom
/**
 * Typing "Included" into a typed year cell.
 *
 * Regression: the cell is a controlled input whose value was re-derived from
 * the parsed model on every keystroke. "I" does not parse, so it became 0 and
 * the field rewrote itself to "0" before the second letter arrived — the word
 * was impossible to type, and only a paste ever landed it. The product copy
 * tells the user to type it, so this is the test that keeps it typeable.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FlatAmountInput } from "@/app/admin/service-estimator/ServiceEstimatorClient";
import type { ServiceFlatAmount } from "@/lib/serviceEstimator/types";

/** The real parser from the estimator, kept in step with the component. */
const parseFlatAmount = (raw: string): ServiceFlatAmount => {
  const trimmed = raw.trim();
  if (/^inc(luded)?$/i.test(trimmed)) return "included";
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** Drives the cell the way the page does: raw text in, parsed model back out. */
function Harness({ onModel }: { onModel: (v: ServiceFlatAmount) => void }) {
  const [value, setValue] = React.useState<ServiceFlatAmount | undefined>(undefined);
  return (
    <FlatAmountInput
      value={value}
      onRawChange={(raw) => {
        const parsed = parseFlatAmount(raw);
        setValue(parsed);
        onModel(parsed);
      }}
    />
  );
}

/** Type a string one character at a time, as a keyboard does. */
function typeSequentially(el: HTMLInputElement, text: string) {
  for (const ch of text) {
    fireEvent.change(el, { target: { value: el.value + ch } });
  }
}

describe("typed year cell", () => {
  it("lets the word Included be typed one letter at a time", () => {
    const onModel = vi.fn();
    render(<Harness onModel={onModel} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;

    typeSequentially(el, "Included");

    expect(el.value).toBe("Included");
    expect(onModel).toHaveBeenLastCalledWith("included");
  });

  it("does not collapse the first letter to zero", () => {
    render(<Harness onModel={() => {}} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;

    fireEvent.change(el, { target: { value: "I" } });

    expect(el.value).toBe("I");
    expect(el.value).not.toBe("0");
  });

  it("still takes a plain number", () => {
    const onModel = vi.fn();
    render(<Harness onModel={onModel} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;

    typeSequentially(el, "42000");

    expect(el.value).toBe("42000");
    expect(onModel).toHaveBeenLastCalledWith(42000);
  });

  it("snaps to the canonical spelling on blur", () => {
    render(<Harness onModel={() => {}} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;

    typeSequentially(el, "inc");
    expect(el.value).toBe("inc");

    fireEvent.blur(el);
    expect(el.value).toBe("Included");
  });

  it("shows the canonical value when it is not being edited", () => {
    render(<FlatAmountInput value="included" onRawChange={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Included");
  });
});
