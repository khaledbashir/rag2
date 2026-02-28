"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useProposalContext } from "@/contexts/ProposalContext";
import { useFormContext } from "react-hook-form";
import { generateGapFillQuestions, formatGapFillQuestion, type GapFillQuestion } from "@/lib/gap-fill-questions";
import { MessageSquare, CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Gap Fill Sidebar Component
 * 
 * Phase 2.1.2: Intelligence Sidebar that identifies missing data and asks
 * targeted questions to fill gaps in AI-extracted proposal data.
 * 
 * Architecture: Uses "Stacked Panel" approach (hidden/visible CSS) for zero
 * React lifecycle lag when toggling between Drafting Table and Chat.
 */
export function GapFillSidebar() {
    const { data: session } = useSession();
    const { watch, setValue } = useFormContext();
    const {
        aiFields,
        verifiedFields,
    } = useProposalContext();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [_answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Get proposal data
    const proposalData = watch();
    const proposalIdValue = watch("details.proposalId");

    // Generate gap fill questions
    const questions = useMemo(() => {
        const proposal = {
            ...proposalData,
            aiFilledFields: aiFields,
            verifiedFields,
        };
        return generateGapFillQuestions(proposal);
    }, [proposalData, aiFields, verifiedFields]);

    const currentQuestion = questions[currentQuestionIndex];
    const hasMoreQuestions = currentQuestionIndex < questions.length - 1;
    const progress = questions.length > 0 
        ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100)
        : 100;

    // Handle answer submission
    const handleAnswer = async (answer: string) => {
        if (!currentQuestion || !answer.trim()) return;

        setIsSubmitting(true);

        try {
            // Update form field
            const fieldPath = currentQuestion.fieldPath;
            const fieldValue = parseAnswer(answer, currentQuestion.type);

            // Set value in form
            if (fieldPath.startsWith("details.screens[")) {
                // Screen field
                const match = fieldPath.match(/details\.screens\[(\d+)\]\.(.+)/);
                if (match) {
                    const [, index, field] = match;
                    const screens = watch("details.screens") || [];
                    const updatedScreens = [...screens];
                    updatedScreens[parseInt(index)] = {
                        ...updatedScreens[parseInt(index)],
                        [field]: fieldValue,
                    };
                    setValue("details.screens", updatedScreens);
                }
            } else {
                // Top-level field
                setValue(fieldPath as any, fieldValue);
            }

            // Mark as verified if it was AI-filled
            if (aiFields.includes(fieldPath) && proposalIdValue) {
                try {
                    await fetch(`/api/proposals/${proposalIdValue}/verify-field`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fieldPath,
                            verifiedBy: session?.user?.email || "user",
                        }),
                    });
                } catch (error) {
                    console.error("Failed to verify field:", error);
                }
            }

            // Store answer
            setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));

            // Move to next question
            if (hasMoreQuestions) {
                setCurrentQuestionIndex(prev => prev + 1);
            }
        } catch (error) {
            console.error("Error submitting answer:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Skip question
    const handleSkip = () => {
        if (hasMoreQuestions) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    // Parse answer based on question type
    const parseAnswer = (answer: string, type: GapFillQuestion["type"]): any => {
        switch (type) {
            case "number":
                return parseFloat(answer) || 0;
            case "boolean":
                return answer.toLowerCase() === "yes" || answer.toLowerCase() === "true";
            case "multiple-choice":
                return answer;
            default:
                return answer;
        }
    };

    // If no questions, show completion state
    if (questions.length === 0) {
        return (
            <Card className="h-full border-brand-blue/20 bg-brand-blue/5">
                <CardContent className="flex flex-col items-center justify-center h-full p-6">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                    <h3 className="text-sm font-bold text-foreground mb-2">All Fields Complete</h3>
                    <p className="text-xs text-muted-foreground text-center">
                        All critical fields have been filled. The proposal is ready for review.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full border-brand-blue/20 bg-card/50 flex flex-col">
            <CardHeader className="pb-4 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-brand-blue" />
                        Gap Fill Assistant
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] border-brand-blue/30 text-brand-blue">
                        {currentQuestionIndex + 1} / {questions.length}
                    </Badge>
                </div>
                
                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-brand-blue transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-4 overflow-y-auto">
                {currentQuestion && (
                    <div className="space-y-4">
                        {/* Question */}
                        <div className="space-y-2">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-foreground leading-relaxed">
                                        {formatGapFillQuestion(currentQuestion)}
                                    </p>
                                    {currentQuestion.screenName && (
                                        <Badge variant="outline" className="mt-2 text-[10px] border-border">
                                            {currentQuestion.screenName}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Answer Input */}
                        <div className="space-y-2">
                            {currentQuestion.type === "multiple-choice" && currentQuestion.options ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {currentQuestion.options.map((option) => (
                                        <Button
                                            key={option}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleAnswer(option)}
                                            disabled={isSubmitting}
                                            className="text-xs"
                                        >
                                            {option}
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type={currentQuestion.type === "number" ? "number" : "text"}
                                        placeholder="Enter your answer..."
                                        className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !isSubmitting) {
                                                handleAnswer(e.currentTarget.value);
                                            }
                                        }}
                                        disabled={isSubmitting}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            const input = document.querySelector('input[type="text"], input[type="number"]') as HTMLInputElement;
                                            if (input?.value) {
                                                handleAnswer(input.value);
                                                input.value = "";
                                            }
                                        }}
                                        disabled={isSubmitting}
                                        className="bg-brand-blue hover:bg-brand-blue/90"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSkip}
                                disabled={isSubmitting || !hasMoreQuestions}
                                className="text-xs text-muted-foreground"
                            >
                                Skip
                            </Button>
                            {hasMoreQuestions && (
                                <span className="text-[10px] text-muted-foreground">
                                    {questions.length - currentQuestionIndex - 1} more question{questions.length - currentQuestionIndex - 1 !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Completion State */}
                {!hasMoreQuestions && currentQuestionIndex === questions.length - 1 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                        <h3 className="text-sm font-bold text-foreground mb-2">All Questions Answered</h3>
                        <p className="text-xs text-muted-foreground">
                            You've completed all gap fill questions. The proposal is ready for review.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default GapFillSidebar;
