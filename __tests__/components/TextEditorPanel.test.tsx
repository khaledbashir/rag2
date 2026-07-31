/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { TextEditorPanel } from "@/app/components/proposal/TextEditorPanel";

type EditorForm = {
  details: {
    documentMode: string;
    additionalNotes: string;
    paymentTerms: string;
    customProposalNotes: string;
    signatureBlockText: string;
  };
};

function renderEditor() {
  let methods: UseFormReturn<EditorForm> | null = null;

  function Harness() {
    const form = useForm<EditorForm>({
      defaultValues: {
        details: {
          documentMode: "CONTRACT",
          additionalNotes: "First line\nSecond line",
          paymentTerms: "50% on execution\n50% on completion",
          customProposalNotes: "",
          signatureBlockText: "",
        },
      },
    });
    methods = form;
    return (
      <FormProvider {...form}>
        <TextEditorPanel />
      </FormProvider>
    );
  }

  render(<Harness />);
  fireEvent.click(screen.getByText("Text Editor"));
  return () => methods as UseFormReturn<EditorForm>;
}

describe("TextEditorPanel rich-text controls", () => {
  it("shows formatting controls for every narrative text box", () => {
    renderEditor();

    expect(screen.getAllByRole("button", { name: "Bold" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Bulleted list" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Numbered list" })).toHaveLength(4);
  });

  it("writes a selected bulleted list back to the proposal form", () => {
    const getMethods = renderEditor();
    const intro = screen.getByLabelText(/Introduction Text/) as HTMLTextAreaElement;

    act(() => {
      intro.focus();
      intro.setSelectionRange(0, intro.value.length);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Bulleted list" })[0]);

    expect(getMethods().getValues("details.additionalNotes")).toBe("- First line\n- Second line");
    expect(getMethods().getFieldState("details.additionalNotes").isDirty).toBe(true);
  });
});
