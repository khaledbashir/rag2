"use client";

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/**
 * Exchange rate entry — appears under CurrencySelector when the selected currency is not USD.
 *
 * The rate is the USD → selected-currency multiplier (e.g. 0.79 for GBP means $1 = £0.79).
 * Stored at `details.exchangeRate`. Used by pricingMath + PDF/Excel exports to convert
 * USD-native line items into the selected currency before display.
 */
const ExchangeRateInput = () => {
    const { control, setValue, getValues } = useFormContext();
    const explicitCurrency = useWatch({ name: "details.currency", control }) as string | undefined;
    const pricingDocCurrency = (useWatch({ name: "details.pricingDocument", control }) as any)?.currency as string | undefined;
    const currency: string = (explicitCurrency && explicitCurrency !== "") ? explicitCurrency : (pricingDocCurrency || "USD");
    const rate = useWatch({ name: "details.exchangeRate", control });

    // When user switches to USD, lock rate to 1 (no conversion makes sense for USD→USD).
    useEffect(() => {
        if (currency === "USD" && getValues("details.exchangeRate") !== 1) {
            setValue("details.exchangeRate", 1, { shouldDirty: true });
        }
    }, [currency, setValue, getValues]);

    if (currency === "USD") return null;

    return (
        <FormField
            control={control}
            name="details.exchangeRate"
            render={({ field }) => (
                <FormItem>
                    <div className="flex justify-between gap-5 items-center text-sm">
                        <div>
                            <FormLabel>{`1 USD = ? ${currency}`}</FormLabel>
                        </div>
                        <div>
                            <FormControl>
                                <Input
                                    {...field}
                                    type="number"
                                    step="0.0001"
                                    min={0}
                                    className="w-[13rem]"
                                    placeholder="e.g. 0.79"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        field.onChange(v === "" ? undefined : Number(v));
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                All USD prices will be multiplied by this rate.
                            </p>
                        </div>
                    </div>
                </FormItem>
            )}
        />
    );
};

export default ExchangeRateInput;
