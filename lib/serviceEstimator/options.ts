/**
 * Editing operations for priced options inside ONE estimate.
 *
 * Natalia, 2026-08-11: "if she needs some items as add on, she has to start new
 * estimate/project … we have now 3 cost sheet going for one thing … we need an
 * option to say optional add on and add as many services as needed … also has
 * to be options — option 1,2,3 … all within one project aka excel."
 *
 * The engine already prices a list of options; what was missing was any way to
 * build that list. `ServiceEstimatorInput` keeps `events`/`breakFix` as the
 * primary option for back-compatibility, so every write here mirrors option one
 * back onto those fields — a draft saved by this build still opens correctly in
 * anything that only reads the top-level lines.
 */
import { listOptions } from "./engine";
import type {
  ServiceEstimatorInput,
  ServiceEstimatorOption,
} from "./types";

/** Ids are stable across renames so React keys and sheet links survive edits. */
const newId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `option-${Math.round(performance.now() * 1000)}`;

const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The estimate's options, always at least one. An estimate that has never used
 * options reports a single option built from the top-level service lines, which
 * is what the author has been editing all along.
 */
export function materializeOptions(input: ServiceEstimatorInput): ServiceEstimatorOption[] {
  return listOptions(input).map((option) => ({ ...option }));
}

/** True once the author has actually asked for alternatives. */
export function hasMultipleOptions(input: ServiceEstimatorInput): boolean {
  return (input.options?.length ?? 0) > 1;
}

/**
 * Write an option list back onto the estimate.
 *
 * A single remaining option collapses back to the implicit form: `options` is
 * emptied and its lines live on `events`/`breakFix` alone. That keeps a
 * one-option estimate byte-identical to what this page produced before options
 * existed, so nothing about the common case changes.
 */
export function commitOptions(
  input: ServiceEstimatorInput,
  options: ServiceEstimatorOption[],
): ServiceEstimatorInput {
  if (options.length === 0) return input;
  const [primary] = options;
  return {
    ...input,
    events: primary.events,
    breakFix: primary.breakFix,
    options: options.length === 1 ? [] : options,
  };
}

/** Default name for the nth option, matching how Natalia numbers them. */
export function defaultOptionName(index: number): string {
  return `Option ${index + 1}`;
}

/**
 * Add an option. It starts as a copy of the option the author is looking at —
 * the real workflow is "the same scope, plus or minus event support", not a
 * blank sheet.
 */
export function addOption(
  input: ServiceEstimatorInput,
  copyFromId?: string,
): { input: ServiceEstimatorInput; addedId: string } {
  const options = materializeOptions(input);
  const source = options.find((option) => option.id === copyFromId) ?? options[options.length - 1];
  const added: ServiceEstimatorOption = {
    id: newId(),
    name: defaultOptionName(options.length),
    events: deepCopy(source.events),
    breakFix: deepCopy(source.breakFix),
  };
  // Copied lines need their own ids, or the two options share React keys and
  // an edit to one appears to touch the other.
  added.events = added.events.map((event) => ({ ...event, id: newId() }));
  const next = [...options, added];
  return { input: commitOptions(input, next), addedId: added.id };
}

/** Remove an option. The last one never goes — an estimate always prices something. */
export function removeOption(
  input: ServiceEstimatorInput,
  id: string,
): ServiceEstimatorInput {
  const options = materializeOptions(input);
  if (options.length <= 1) return input;
  const next = options.filter((option) => option.id !== id);
  if (next.length === options.length) return input;
  return commitOptions(input, next);
}

/** Rename an option. An empty name falls back to its position. */
export function renameOption(
  input: ServiceEstimatorInput,
  id: string,
  name: string,
): ServiceEstimatorInput {
  const options = materializeOptions(input);
  const next = options.map((option, index) =>
    option.id === id ? { ...option, name: name.trim() === "" ? defaultOptionName(index) : name } : option,
  );
  return commitOptions(input, next);
}

/** Replace one option's service lines — how every field edit lands. */
export function patchOption(
  input: ServiceEstimatorInput,
  id: string,
  patch: Partial<Omit<ServiceEstimatorOption, "id">>,
): ServiceEstimatorInput {
  const options = materializeOptions(input);
  const next = options.map((option) => (option.id === id ? { ...option, ...patch } : option));
  return commitOptions(input, next);
}

/** The option an editor should act on, tolerating a stale selection. */
export function resolveSelectedOption(
  input: ServiceEstimatorInput,
  selectedId: string | null,
): ServiceEstimatorOption {
  const options = materializeOptions(input);
  return options.find((option) => option.id === selectedId) ?? options[0];
}
