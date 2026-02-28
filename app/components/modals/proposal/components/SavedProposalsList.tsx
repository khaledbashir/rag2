"use client";

import React from "react";

// RHF
import { useFormContext } from "react-hook-form";

// ShadCn
import { Card, CardContent } from "@/components/ui/card";

// Components
import { BaseButton } from "@/app/components";

// Contexts
import { useProposalContext } from "@/contexts/ProposalContext";

// Helpers
import { formatNumberWithCommas } from "@/lib/helpers";

// Variables
import { DATE_OPTIONS } from "@/lib/variables";

// Types
import { ProposalType } from "@/types";

type SavedProposalsListProps = {
    setModalState: React.Dispatch<React.SetStateAction<boolean>>;
};

const SavedProposalsList = ({ setModalState }: SavedProposalsListProps) => {
    const { savedProposals, onFormSubmit, deleteProposal } = useProposalContext();

    const { reset } = useFormContext<ProposalType>();

    // Prepare proposal for loading: convert date strings to Date objects and clear transient fields
    const updateFields = (selected: ProposalType) => {
        (selected.details as Record<string, unknown>).dueDate = new Date(selected.details.dueDate);
        (selected.details as Record<string, unknown>).proposalDate = new Date(selected.details.proposalDate);
        selected.details.proposalLogo = "";
        selected.details.signature = { data: "" };
    };

    /**
     * Transform date values for next submission
     *
    * @param {ProposalType} selected - The selected proposal
     */
    const transformDates = (selected: ProposalType) => {
        selected.details.dueDate = new Date(
            selected.details.dueDate
        ).toLocaleDateString("en-US", DATE_OPTIONS);
        selected.details.proposalDate = new Date(
            selected.details.proposalDate
        ).toLocaleDateString("en-US", DATE_OPTIONS);
    };

    /**
     * Loads a given proposal into the form.
     *
    * @param {ProposalType} selectedProposal - The selected proposal
     */
    const load = (selectedProposal: ProposalType) => {
        if (selectedProposal) {
            updateFields(selectedProposal);
            reset(selectedProposal);
            transformDates(selectedProposal);

            // Close modal
            setModalState(false);
        }
    };


    return (
        <>
            <div className="flex flex-col gap-5 overflow-y-auto max-h-72">
                {savedProposals.map((proposal, idx) => (
                    <Card
                        key={idx}
                        className="p-2 border rounded-sm hover:border-[#0A52EF] hover:shadow-lg cursor-pointer"
                    // onClick={() => handleSelect(proposal)}
                    >
                        <CardContent className="flex justify-between">
                            <div>
                                {/* <FileText /> */}
                                <p className="font-semibold">
                                    Proposal ID: {proposal.details.proposalNumber}{" "}
                                </p>
                                <small className="text-gray-500">
                                    Updated at: {proposal.details.updatedAt}
                                </small>

                                <div>
                                    <p>Sender: {proposal.sender.name}</p>
                                    <p>Receiver: {proposal.receiver.name}</p>
                                    <p>
                                        Total:{" "}
                                        <span className="font-semibold">
                                            {formatNumberWithCommas(
                                                Number(
                                                    proposal.details.totalAmount
                                                )
                                            )}{" "}
                                            {proposal.details.currency}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <BaseButton
                                    tooltipLabel="Load proposal details into the form"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => load(proposal)}
                                >
                                    Load
                                </BaseButton>

                                {/* Remove Proposal Button */}
                                <BaseButton
                                    variant="destructive"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteProposal(idx);
                                    }}
                                >
                                    Delete
                                </BaseButton>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {savedProposals.length == 0 && (
                    <div>
                        <p>No proposals in the vault</p>
                    </div>
                )}
            </div>
        </>
    );
};

export default SavedProposalsList;
