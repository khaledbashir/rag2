/**
 * @vitest-environment jsdom
 *
 * Natalia 2026-08-10: "proposal builder has Scope of work toggle but no text
 * box to enter." The toggle and its editor must ship as one control, in every
 * document type — never a switch that turns on a section nobody can write.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { ScopeOfWorkControl } from "@/app/components/proposal/form/wizard/steps/ScopeOfWorkControl";

type ScopeForm = {
  details: {
    showScopeOfWork: boolean;
    scopeOfWorkText: string;
  };
};

function renderControl(initial: Partial<ScopeForm["details"]> = {}) {
  let methods: UseFormReturn<ScopeForm> | null = null;

  function Harness() {
    const form = useForm<ScopeForm>({
      defaultValues: {
        details: {
          showScopeOfWork: false,
          scopeOfWorkText: "",
          ...initial,
        },
      },
    });
    methods = form;
    return (
      <FormProvider {...(form as any)}>
        <ScopeOfWorkControl idSuffix="budget" />
      </FormProvider>
    );
  }

  render(<Harness />);
  return () => methods as UseFormReturn<ScopeForm>;
}

const editor = () => screen.queryByRole("textbox");

describe("Scope of Work control", () => {
  it("opens a text box as soon as the toggle goes on", () => {
    renderControl();
    expect(editor()).toBeNull();

    fireEvent.click(screen.getByRole("switch"));

    expect(editor()).not.toBeNull();
  });

  it("writes what the author types back to the form", () => {
    const getForm = renderControl({ showScopeOfWork: true });

    fireEvent.change(editor()!, {
      target: { value: "- Furnish and install the displays" },
    });

    expect(getForm().getValues("details.scopeOfWorkText")).toBe(
      "- Furnish and install the displays",
    );
  });

  it("keeps the text visible when it was saved with the document", () => {
    renderControl({ showScopeOfWork: true, scopeOfWorkText: "Commission the control system" });

    expect(editor()).toHaveValue("Commission the control system");
  });

  it("carries the same formatting controls as the other narrative boxes", () => {
    renderControl({ showScopeOfWork: true });

    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulleted list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Numbered list" })).toBeInTheDocument();
  });
});
