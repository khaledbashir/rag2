"use client";

// RHF
import { useFormContext } from "react-hook-form";

// ShadCn
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type FormSelectProps = {
    name: string;
    label?: string;
    placeholder?: string;
    options: { label: string; value: string }[];
    vertical?: boolean;
};

const FormSelect = ({
    name,
    label,
    placeholder,
    options,
    vertical = false,
}: FormSelectProps) => {
    const { control } = useFormContext();

    const verticalSelect = (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    {label && <FormLabel>{`${label}:`}</FormLabel>}
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger className="w-full bg-background border-border">
                                <SelectValue placeholder={placeholder} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                            {options.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )}
        />
    );

    const horizontalSelect = (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <div className="flex w-full gap-5 items-center text-sm">
                        {label && <FormLabel className="flex-1">{`${label}:`}</FormLabel>}
                        <div className="flex-[2] relative flex items-center gap-2">
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className="w-full bg-background border-border">
                                        <SelectValue placeholder={placeholder} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-popover border-border text-popover-foreground">
                                    {options.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                            className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <FormMessage className="text-right" />
                </FormItem>
            )}
        />
    );

    return vertical ? verticalSelect : horizontalSelect;
};

export default FormSelect;
