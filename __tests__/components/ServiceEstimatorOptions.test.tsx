/**
 * @vitest-environment jsdom
 *
 * Natalia, 2026-08-11: "Alexis said if she needs some items as add on, she has
 * to start new estimate/project … we have now 3 cost sheet going for one thing
 * … also has to be options — option 1,2,3 … all within one project aka excel."
 *
 * The engine had priced options for weeks; this page had no way to make one.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it } from "vitest";

import ServiceEstimatorClient from "@/app/admin/service-estimator/ServiceEstimatorClient";

const addOptionButton = () => screen.getByRole("button", { name: /add option/i });
const optionTab = (name: string | RegExp) => screen.getByRole("button", { name });
const serviceLineNames = () =>
  screen
    .getAllByPlaceholderText("Service line name")
    .map((field) => (field as HTMLInputElement).value);

describe("Service Estimator — options in one estimate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts as a single-option estimate with no tab strip", () => {
    render(<ServiceEstimatorClient />);

    expect(screen.getByText(/this estimate prices one version/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Option 1")).toBeNull();
  });

  it("adds Option 2 and shows both tabs", () => {
    render(<ServiceEstimatorClient />);
    fireEvent.click(addOptionButton());

    expect(optionTab(/^Option 1/)).toBeInTheDocument();
    expect(optionTab(/^Option 2/)).toBeInTheDocument();
    expect(screen.queryByText(/this estimate prices one version/i)).toBeNull();
  });

  it("keeps an add-on service on the option it was added to", () => {
    render(<ServiceEstimatorClient />);
    const before = serviceLineNames();

    fireEvent.click(addOptionButton());
    fireEvent.click(screen.getByRole("button", { name: /optional add-on/i }));

    expect(serviceLineNames()).toHaveLength(before.length + 1);
    expect(serviceLineNames()).toContain("Optional Add-On 1");

    // Back to Option 1 — untouched.
    fireEvent.click(optionTab(/^Option 1/));
    expect(serviceLineNames()).toEqual(before);
  });

  it("edits the option the author is looking at, not the first one", () => {
    render(<ServiceEstimatorClient />);
    fireEvent.click(addOptionButton());

    const [firstLine] = screen.getAllByPlaceholderText("Service line name");
    fireEvent.change(firstLine, { target: { value: "Option 2 Coverage" } });
    expect(serviceLineNames()[0]).toBe("Option 2 Coverage");

    fireEvent.click(optionTab(/^Option 1/));
    expect(serviceLineNames()[0]).not.toBe("Option 2 Coverage");
  });

  it("renames an option, which is what the workbook tab is called", () => {
    render(<ServiceEstimatorClient />);
    fireEvent.click(addOptionButton());

    fireEvent.change(screen.getByPlaceholderText("Option 2"), {
      target: { value: "With Event Support" },
    });

    expect(optionTab(/^With Event Support/)).toBeInTheDocument();
  });

  it("removes an option and collapses back to a single-version estimate", () => {
    render(<ServiceEstimatorClient />);
    fireEvent.click(addOptionButton());
    fireEvent.click(screen.getByRole("button", { name: /remove this option/i }));

    expect(screen.getByText(/this estimate prices one version/i)).toBeInTheDocument();
  });

  it("prices each option separately in the tab strip", () => {
    render(<ServiceEstimatorClient />);
    fireEvent.click(addOptionButton());
    fireEvent.click(screen.getByRole("button", { name: /calculated line/i }));

    const optionTwo = optionTab(/^Option 2/);
    const optionOne = optionTab(/^Option 1/);
    // Both carry their own contract total; the labels are independent nodes.
    expect(within(optionOne).getAllByText(/\$/).length).toBeGreaterThan(0);
    expect(within(optionTwo).getAllByText(/\$/).length).toBeGreaterThan(0);
  });
});
