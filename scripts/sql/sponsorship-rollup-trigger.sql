-- Sponsorship Value = the sum of the per-fiscal-year sponsorship figures.
--
-- This used to run as an asynchronous logic function on opportunity.updated:
-- it re-fetched the record and PATCHed the total a second or two later. Saving
-- one year at a time (which is how the field is actually filled in) therefore
-- produced a partial running total on screen for several seconds, and a dropped
-- event left the total permanently short. Doing it in the same transaction as
-- the write means the total is correct the instant a year is saved, and any
-- drift heals the next time the row is touched.
--
-- The guard: a deal with no fiscal-year figures keeps whatever total was typed
-- against it. Sponsorship Value existed long before the year fields, and the
-- unphased deals carry numbers the team entered by hand.

CREATE OR REPLACE FUNCTION workspace_cjspnkm8glh7iooo1gep8c1qo.anc_sponsorship_rollup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total   numeric := 0;
  entered integer := 0;
  ccy     text    := NULL;
  amounts numeric[];
  codes   text[];
  i       integer;
BEGIN
  amounts := ARRAY[
    NEW."sponsorship2026AmountMicros", NEW."sponsorship2027AmountMicros",
    NEW."sponsorship2028AmountMicros", NEW."sponsorship2029AmountMicros",
    NEW."sponsorship2030AmountMicros", NEW."sponsorship2031AmountMicros",
    NEW."sponsorship2032AmountMicros"
  ];
  codes := ARRAY[
    NEW."sponsorship2026CurrencyCode", NEW."sponsorship2027CurrencyCode",
    NEW."sponsorship2028CurrencyCode", NEW."sponsorship2029CurrencyCode",
    NEW."sponsorship2030CurrencyCode", NEW."sponsorship2031CurrencyCode",
    NEW."sponsorship2032CurrencyCode"
  ];

  FOR i IN 1..7 LOOP
    IF amounts[i] IS NOT NULL THEN
      total := total + amounts[i];
      entered := entered + 1;
      ccy := COALESCE(ccy, codes[i]);
    END IF;
  END LOOP;

  IF entered = 0 THEN
    RETURN NEW;
  END IF;

  NEW."sponsorshipValueAmountMicros" := total;
  NEW."sponsorshipValueCurrencyCode" :=
    COALESCE(ccy, NEW."sponsorshipValueCurrencyCode", 'USD');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anc_sponsorship_rollup_trg
  ON workspace_cjspnkm8glh7iooo1gep8c1qo.opportunity;

CREATE TRIGGER anc_sponsorship_rollup_trg
  BEFORE INSERT OR UPDATE ON workspace_cjspnkm8glh7iooo1gep8c1qo.opportunity
  FOR EACH ROW
  EXECUTE FUNCTION workspace_cjspnkm8glh7iooo1gep8c1qo.anc_sponsorship_rollup();
