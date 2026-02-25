"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    MessageSquare,
    Send,
    X,
    Zap,
    Plus,
    Brain,
    Mic,
    MicOff,
    Minus,
    ArrowDown,
    CheckCircle2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
    ConversationStage,
    createInitialState,
} from "@/services/chat/proposalConversationFlow";
import type { CollectedData, StageAction } from "@/services/chat/proposalConversationFlow";
import { executeActions, executeScreenActions } from "@/services/chat/formFillBridge";
import type { FormFillContext, ScreenAction } from "@/services/chat/formFillBridge";
import { getScreenContext } from "@/services/chat/screenContext";
import type { ScreenContext } from "@/services/chat/screenContext";
import { routeMessage } from "@/services/chat/copilotRouter";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export interface FieldUpdate {
    field: string;
    value: string;
}

export interface ActionCard {
    title: string;
    lines: string[];
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    thinking?: string;
    isThinking?: boolean;
    actionUpdates?: FieldUpdate[];
    actionCards?: ActionCard[];
}

type PersistedChatMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    actionCards?: ActionCard[];
};

type ChatConversation = {
    id: string;
    title: string;
    createdAt: number;
    messages: PersistedChatMessage[];
};

export interface CopilotPanelProps {
    onSendMessage?: (message: string, history: ChatMessage[]) => Promise<string>;
    formFillContext?: FormFillContext;
    projectId?: string;
    isNewProject?: boolean;
    hasExistingData?: boolean;
    currentStep?: number;
    quickActions?: Array<{ label: string; prompt: string }>;
    className?: string;
    onOpenChange?: (isOpen: boolean) => void;
    onNavigateStep?: (step: number) => void;
}

export const COPILOT_PANEL_WIDTH = 400;

const ACTION_BLOCK_REGEX = /:::ACTION:::\s*(\{[\s\S]*?\})\s*:::END:::/g;

const ACTION_FIELD_ALIASES: Record<string, string> = {
    projectName: "proposalName",
    projectLocation: "location",
    poNumber: "purchaseOrderNumber",
    customIntroText: "introductionText",
};

const COPILOT_TO_PATCH: Record<string, { target: "top" | "receiver" | "sender"; key: string }> = {
    clientName: { target: "top", key: "clientName" },
    clientAddress: { target: "top", key: "clientAddress" },
    clientCity: { target: "top", key: "clientCity" },
    clientZip: { target: "top", key: "clientZip" },
    venue: { target: "top", key: "venue" },
    documentMode: { target: "top", key: "documentMode" },
    paymentTerms: { target: "top", key: "paymentTerms" },
    additionalNotes: { target: "top", key: "additionalNotes" },
    signatureBlockText: { target: "top", key: "signatureBlockText" },
    customProposalNotes: { target: "top", key: "customProposalNotes" },
    loiHeaderText: { target: "top", key: "loiHeaderText" },

    clientState: { target: "receiver", key: "state" },
    clientCountry: { target: "receiver", key: "country" },
    clientEmail: { target: "receiver", key: "email" },
    clientPhone: { target: "receiver", key: "phone" },

    senderName: { target: "sender", key: "name" },
    senderAddress: { target: "sender", key: "address" },
    senderCity: { target: "sender", key: "city" },
    senderCountry: { target: "sender", key: "country" },
    senderEmail: { target: "sender", key: "email" },
    senderPhone: { target: "sender", key: "phone" },
};

function normalizeDocumentMode(value: unknown): "BUDGET" | "PROPOSAL" | "LOI" | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === "BUDGET" || normalized === "PROPOSAL" || normalized === "LOI") return normalized;
    return null;
}

function labelForField(field: string) {
    const labels: Record<string, string> = {
        clientName: "Client Name",
        clientAddress: "Address",
        clientCity: "City",
        clientState: "State",
        clientZip: "Zip",
        clientCountry: "Country",
        clientEmail: "Client Email",
        clientPhone: "Client Phone",
        senderName: "Sender Name",
        senderAddress: "Sender Address",
        senderCity: "Sender City",
        senderCountry: "Sender Country",
        senderEmail: "Sender Email",
        senderPhone: "Sender Phone",
        documentMode: "Document Mode",
        projectName: "Project Name",
        projectLocation: "Project Location",
        venue: "Venue",
        currency: "Currency",
        language: "Language",
        proposalDate: "Proposal Date",
        dueDate: "Due Date",
        poNumber: "PO Number",
        paymentTerms: "Payment Terms",
        signatureBlockText: "Signature Block",
        additionalNotes: "Additional Notes",
        customProposalNotes: "Proposal Notes",
        loiHeaderText: "LOI Header",
    };
    return labels[field] || field;
}

function normalizeActionField(field: string): string {
    return ACTION_FIELD_ALIASES[field] || field;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLoose(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueSuggestions(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }
    return out;
}

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="mb-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
            >
                <Brain className={cn("w-3 h-3", isStreaming && "animate-pulse")} style={{ color: "#0055B3" }} />
                <span>{isStreaming ? "Reasoning..." : "Reasoning"}</span>
            </button>
            {expanded && thinking && (
                <div className="mt-1.5 pl-3 border-l-2 border-zinc-300 text-[10px] text-zinc-500 leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                    {thinking}
                </div>
            )}
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#F3F4F6] px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_120ms_infinite]" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_240ms_infinite]" />
        </div>
    );
}

export default function CopilotPanel({
    onSendMessage,
    formFillContext,
    projectId,
    isNewProject,
    hasExistingData,
    currentStep = 0,
    quickActions,
    className,
    onOpenChange,
    onNavigateStep,
}: CopilotPanelProps) {
    const [isOpen, _setIsOpen] = useState(false);
    // Sync open state to body class so layout shrinks via CSS (globals.css: body.copilot-open)
    const setIsOpen = React.useCallback((open: boolean) => {
        _setIsOpen(open);
        if (typeof document !== "undefined") {
            document.body.classList.toggle("copilot-open", open);
        }
    }, []);
    // Clean up body class on unmount
    React.useEffect(() => () => { document.body.classList.remove("copilot-open"); }, []);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [newMessageCount, setNewMessageCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const viewportRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const autoOpenedRef = useRef(false);
    const prevMessageCountRef = useRef(0);
    const loadedProjectRef = useRef<string | null>(null);

    const [conversationStage, setConversationStage] = useState<ConversationStage>(ConversationStage.GREETING);
    const [collectedData, setCollectedData] = useState<CollectedData>(createInitialState().collected);
    const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

    const {
        start: startListening,
        stop: stopListening,
        transcript,
        interimTranscript,
        isListening,
        isSupported: isMicSupported,
        reset: resetTranscript,
    } = useSpeechRecognition();

    const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const toPersistedMessages = useCallback((list: ChatMessage[]): PersistedChatMessage[] => {
        return list
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-50)
            .map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
                actionCards: m.actionCards?.length ? m.actionCards : undefined,
            }));
    }, []);

    const normalizeLoadedMessages = useCallback((raw: unknown): ChatMessage[] => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((item: any, idx: number): ChatMessage | null => {
                const role = item?.role;
                if (role !== "user" && role !== "assistant" && role !== "system") return null;
                const content = String(item?.content || "");
                if (!content.trim()) return null;
                const timestamp = Number(item?.timestamp || Date.now());
                const actionCards = Array.isArray(item?.actionCards)
                    ? item.actionCards
                        .map((card: any) => ({
                            title: String(card?.title || "").trim(),
                            lines: Array.isArray(card?.lines) ? card.lines.map((line: any) => String(line || "")) : [],
                        }))
                        .filter((card: ActionCard) => card.title && card.lines.length > 0)
                    : undefined;

                return {
                    id: String(item?.id || `loaded-${idx}-${Date.now()}`),
                    role,
                    content,
                    timestamp,
                    actionCards: actionCards && actionCards.length ? actionCards : undefined,
                };
            })
            .filter(Boolean) as ChatMessage[];
    }, []);

    const buildConversationTitle = useCallback((list: ChatMessage[]) => {
        const firstUser = list.find((m) => m.role === "user")?.content?.trim() || "New chat";
        return firstUser.length > 40 ? `${firstUser.slice(0, 40)}...` : firstUser;
    }, []);

    const persistChatState = useCallback(
        async (nextMessages: ChatMessage[], nextConversations?: ChatConversation[]) => {
            if (!projectId || projectId === "new") return;
            const payload: Record<string, unknown> = {
                chatHistory: toPersistedMessages(nextMessages),
            };
            if (nextConversations) {
                payload.chatConversations = nextConversations.map((conv) => ({
                    ...conv,
                    messages: conv.messages.slice(-50),
                }));
            }
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`PATCH /api/projects/${projectId} failed (${res.status}): ${text}`);
            }
        },
        [projectId, toPersistedMessages]
    );

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    }, []);

    useEffect(() => {
        onOpenChange?.(isOpen);
        if (isOpen) document.body.classList.add("copilot-open");
        else document.body.classList.remove("copilot-open");
        return () => document.body.classList.remove("copilot-open");
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        if (transcript) setInput(transcript);
    }, [transcript]);

    useEffect(() => {
        if (isListening && interimTranscript) {
            setInput(transcript ? `${transcript} ${interimTranscript}` : interimTranscript);
        }
    }, [interimTranscript, isListening, transcript]);

    useEffect(() => {
        if (isNewProject && !hasExistingData && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            setIsOpen(true);
        }
    }, [isNewProject, hasExistingData]);

    useEffect(() => {
        if (!isOpen) return;
        if (isAtBottom) {
            scrollToBottom();
            setNewMessageCount(0);
        } else if (messages.length > prevMessageCountRef.current) {
            setNewMessageCount((count) => count + 1);
        }
        prevMessageCountRef.current = messages.length;
    }, [messages, isOpen, isAtBottom, scrollToBottom]);

    useEffect(() => {
        if (isOpen && inputRef.current) inputRef.current.focus();
    }, [isOpen]);

    const adjustInputHeight = useCallback(() => {
        if (!inputRef.current) return;
        inputRef.current.style.height = "auto";
        const next = Math.max(44, Math.min(120, inputRef.current.scrollHeight));
        inputRef.current.style.height = `${next}px`;
    }, []);

    useEffect(() => {
        adjustInputHeight();
    }, [input, adjustInputHeight]);

    useEffect(() => {
        const id = (projectId || "").trim();
        if (!id || id === "new") return;
        if (loadedProjectRef.current === id) return;
        loadedProjectRef.current = id;

        let cancelled = false;
        const loadChat = async () => {
            try {
                const res = await fetch(`/api/projects/${id}`);
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`GET /api/projects/${id} failed (${res.status}): ${text}`);
                }
                const data = await res.json();
                const project = data?.project || {};
                if (cancelled) return;

                const loadedMessages = normalizeLoadedMessages(project.chatHistory);
                setMessages(loadedMessages);
                setConversationHistory(
                    loadedMessages
                        .filter((m) => m.role === "user" || m.role === "assistant")
                        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
                );

                const rawConversations = Array.isArray(project.chatConversations) ? project.chatConversations : [];
                const normalizedConversations: ChatConversation[] = rawConversations
                    .map((conv: any, idx: number) => ({
                        id: String(conv?.id || `conv-${idx}-${Date.now()}`),
                        title: String(conv?.title || "New chat"),
                        createdAt: Number(conv?.createdAt || Date.now()),
                        messages: normalizeLoadedMessages(conv?.messages).map((m) => ({
                            id: m.id,
                            role: m.role,
                            content: m.content,
                            timestamp: m.timestamp,
                            actionCards: m.actionCards,
                        })),
                    }))
                    .filter((conv: ChatConversation) => conv.messages.length > 0)
                    .slice(-20);
                setChatConversations(normalizedConversations);
                setActiveConversationId(null);

                requestAnimationFrame(() => scrollToBottom(false));
            } catch (error) {
                console.error("[Copilot] Failed to load chat history:", error);
            }
        };
        void loadChat();
        return () => {
            cancelled = true;
        };
    }, [normalizeLoadedMessages, projectId, scrollToBottom]);

    const stripActionBlocks = (text: string) => text.replace(ACTION_BLOCK_REGEX, "").trim();

    const extractActionBlocks = (text: string): Record<string, unknown>[] => {
        const blocks: Record<string, unknown>[] = [];
        const matches = text.matchAll(ACTION_BLOCK_REGEX);
        for (const match of matches) {
            try {
                const parsed = JSON.parse(match[1]);
                if (parsed && typeof parsed === "object") blocks.push(parsed as Record<string, unknown>);
            } catch (error) {
                console.error("[Copilot] Failed to parse ACTION block:", error);
            }
        }
        return blocks;
    };

    const applyActionFields = useCallback(
        async (fields: Record<string, unknown>) => {
            const normalizedEntries = Object.entries(fields)
                .filter(([key, value]) => key && value !== undefined && value !== null)
                .map(([rawField, rawValue]) => ({
                    rawField,
                    field: normalizeActionField(rawField),
                    value: rawValue,
                }));

            const updates = normalizedEntries.map((entry) => ({
                field: entry.field,
                value: typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value),
            }));

            if (updates.length === 0) return updates;

            const screenActions: ScreenAction[] = normalizedEntries.map((entry) => {
                let nextValue: unknown = entry.value;
                if (entry.field === "documentMode") {
                    const normalized = normalizeDocumentMode(nextValue);
                    if (normalized) nextValue = normalized;
                }
                return { action: "set_field", field: entry.field, value: nextValue };
            });

            if (formFillContext) {
                executeScreenActions(formFillContext, screenActions);
            }

            if (projectId && projectId !== "new") {
                const payload: Record<string, unknown> = {};
                const receiverData: Record<string, unknown> = {};
                const senderData: Record<string, unknown> = {};

                for (const entry of normalizedEntries) {
                    const mapping = COPILOT_TO_PATCH[entry.field];
                    if (!mapping) continue;
                    let nextValue = entry.value;
                    if (entry.field === "documentMode") {
                        const normalized = normalizeDocumentMode(entry.value);
                        if (!normalized) continue;
                        nextValue = normalized;
                    }
                    if (mapping.target === "top") payload[mapping.key] = nextValue;
                    if (mapping.target === "receiver") receiverData[mapping.key] = nextValue;
                    if (mapping.target === "sender") senderData[mapping.key] = nextValue;
                }

                if (Object.keys(receiverData).length > 0) payload.receiverData = receiverData;
                if (Object.keys(senderData).length > 0) payload.senderData = senderData;

                if (Object.keys(payload).length > 0) {
                    const res = await fetch(`/api/projects/${projectId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });

                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(`PATCH /api/projects/${projectId} failed (${res.status}): ${text}`);
                    }
                }
            }

            return updates;
        },
        [formFillContext, projectId]
    );

    const persistProjectPatch = useCallback(
        async (payload: Record<string, unknown>) => {
            if (!projectId || projectId === "new") return;
            if (Object.keys(payload).length === 0) return;
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`PATCH /api/projects/${projectId} failed (${res.status}): ${text}`);
            }
        },
        [projectId]
    );

    const resolveSectionByName = useCallback(
        (tables: Array<{ id?: string; name?: string }>, currentNameRaw: string) => {
            const currentName = currentNameRaw.trim();
            if (!currentName) throw new Error("rename_section requires a non-empty currentName.");

            const needle = normalizeLoose(currentName);
            const scored = tables
                .map((table, index) => {
                    const name = (table.name || "").toString();
                    const hay = normalizeLoose(name);
                    let score = 0;
                    if (hay === needle) score = 1000;
                    else if (hay.includes(needle)) score = Math.max(score, 700 + needle.length);
                    else if (needle.includes(hay) && hay.length > 0) score = Math.max(score, 500 + hay.length);
                    else {
                        const needleParts = needle.split(" ").filter(Boolean);
                        const hitCount = needleParts.filter((p) => hay.includes(p)).length;
                        if (hitCount > 0) score = 100 + hitCount;
                    }
                    return { table, index, score, name };
                })
                .filter((x) => x.score > 0)
                .sort((a, b) => b.score - a.score);

            if (scored.length === 0) throw new Error(`No section found matching "${currentName}".`);

            const top = scored[0];
            const ties = scored.filter((x) => x.score === top.score);
            if (ties.length > 1) {
                const options = ties
                    .slice(0, 5)
                    .map((x) => `Section ${x.index + 1}: ${x.name || "(unnamed)"}`)
                    .join(" | ");
                throw new Error(`Ambiguous section name "${currentName}". Matches: ${options}`);
            }

            return top;
        },
        []
    );

    const applyStructuredAction = useCallback(
        async (actionBlock: Record<string, unknown>): Promise<ActionCard | null> => {
            if (!formFillContext) return null;

            const actionType = String(actionBlock.action || "").trim();
            if (!actionType) return null;

            const pricingDocument = formFillContext.getValues("details.pricingDocument") as any;
            const tables = Array.isArray(pricingDocument?.tables) ? pricingDocument.tables : [];

            if (actionType === "rename_section") {
                if (tables.length === 0) throw new Error("No pricing sections available to rename.");
                const newName = String(actionBlock.newName || "").trim();
                if (!newName) throw new Error("rename_section requires newName.");

                let sectionIndex = Number.isFinite(Number(actionBlock.sectionIndex))
                    ? Number(actionBlock.sectionIndex)
                    : null;

                if (sectionIndex === null) {
                    const currentName = String(actionBlock.currentName || "").trim();
                    if (!currentName) throw new Error("rename_section requires sectionIndex or currentName.");
                    sectionIndex = resolveSectionByName(tables, currentName).index;
                }

                if (sectionIndex < 0 || sectionIndex >= tables.length) {
                    throw new Error(`rename_section sectionIndex out of range: ${sectionIndex}.`);
                }

                const table = tables[sectionIndex];
                const tableId = String(table?.id || "").trim();
                if (!tableId) throw new Error(`Section ${sectionIndex + 1} has no table id; cannot persist rename.`);

                const currentOverrides = (formFillContext.getValues("details.tableHeaderOverrides") || {}) as Record<string, string>;
                const oldName = String(currentOverrides[tableId] || table?.name || `Section ${sectionIndex + 1}`);
                const nextOverrides = { ...currentOverrides, [tableId]: newName };

                formFillContext.setValue("details.tableHeaderOverrides", nextOverrides, { shouldDirty: true, shouldValidate: true });
                await persistProjectPatch({ tableHeaderOverrides: nextOverrides });

                return {
                    title: "Section Renamed",
                    lines: [`"${oldName}" -> "${newName}"`],
                };
            }

            if (actionType === "override_description") {
                if (tables.length === 0) throw new Error("No pricing sections available for line-item override.");

                const sectionIndex = Number(actionBlock.sectionIndex);
                const itemIndex = Number(actionBlock.itemIndex);
                const newDescription = String(actionBlock.newDescription || "").trim();
                if (!Number.isInteger(sectionIndex) || !Number.isInteger(itemIndex)) {
                    throw new Error("override_description requires integer sectionIndex and itemIndex.");
                }
                if (!newDescription) throw new Error("override_description requires newDescription.");
                if (sectionIndex < 0 || sectionIndex >= tables.length) {
                    throw new Error(`override_description sectionIndex out of range: ${sectionIndex}.`);
                }

                const table = tables[sectionIndex];
                const tableId = String(table?.id || "").trim();
                if (!tableId) throw new Error(`Section ${sectionIndex + 1} has no table id; cannot persist override.`);

                const items = Array.isArray(table?.items) ? table.items : [];
                if (itemIndex < 0 || itemIndex >= items.length) {
                    throw new Error(`override_description itemIndex out of range: ${itemIndex} for section ${sectionIndex + 1}.`);
                }

                const original = String(items[itemIndex]?.description || "");
                const key = `${tableId}:${itemIndex}`;
                const currentOverrides = (formFillContext.getValues("details.descriptionOverrides") || {}) as Record<string, string>;
                const nextOverrides = { ...currentOverrides, [key]: newDescription };

                formFillContext.setValue("details.descriptionOverrides", nextOverrides, { shouldDirty: true, shouldValidate: true });
                await persistProjectPatch({ descriptionOverrides: nextOverrides });

                return {
                    title: "Line Item Updated",
                    lines: [
                        `Section: ${String(table?.name || `Section ${sectionIndex + 1}`)}`,
                        `"${original}" -> "${newDescription}"`,
                    ],
                };
            }

            if (actionType === "find_replace_description") {
                if (tables.length === 0) throw new Error("No pricing sections available for find/replace.");
                const find = String(actionBlock.find || "").trim();
                const replace = String(actionBlock.replace || "");
                if (!find) throw new Error("find_replace_description requires a non-empty find value.");

                const re = new RegExp(escapeRegExp(find), "gi");
                const currentOverrides = (formFillContext.getValues("details.descriptionOverrides") || {}) as Record<string, string>;
                const nextOverrides = { ...currentOverrides };

                let updateCount = 0;
                const sectionTouched = new Set<string>();

                tables.forEach((table: any, sectionIndex: number) => {
                    const tableId = String(table?.id || "").trim();
                    if (!tableId) return;
                    const items = Array.isArray(table?.items) ? table.items : [];
                    items.forEach((item: any, itemIndex: number) => {
                        const key = `${tableId}:${itemIndex}`;
                        const baseline = String(currentOverrides[key] ?? item?.description ?? "");
                        if (!re.test(baseline)) return;
                        re.lastIndex = 0;
                        const replaced = baseline.replace(re, replace);
                        re.lastIndex = 0;
                        if (replaced === baseline) return;
                        nextOverrides[key] = replaced;
                        updateCount++;
                        sectionTouched.add(String(table?.name || `Section ${sectionIndex + 1}`));
                    });
                });

                if (updateCount === 0) {
                    throw new Error(`I don't see "${find}" in any line-item descriptions.`);
                }

                formFillContext.setValue("details.descriptionOverrides", nextOverrides, { shouldDirty: true, shouldValidate: true });
                await persistProjectPatch({ descriptionOverrides: nextOverrides });

                return {
                    title: "Find & Replace",
                    lines: [
                        `"${find}" -> "${replace}"`,
                        `Updated ${updateCount} line items across ${sectionTouched.size} sections`,
                    ],
                };
            }

            return null;
        },
        [formFillContext, persistProjectPatch, resolveSectionByName]
    );

    const processAssistantResponse = useCallback(
        async (rawResponse: string): Promise<{ cleanText: string; updates: FieldUpdate[]; cards: ActionCard[] }> => {
            const blocks = extractActionBlocks(rawResponse);
            const updates: FieldUpdate[] = [];
            const cards: ActionCard[] = [];

            for (const block of blocks) {
                const fields = block.fields;
                if (fields && typeof fields === "object" && !Array.isArray(fields)) {
                    const blockUpdates = await applyActionFields(fields as Record<string, unknown>);
                    updates.push(...blockUpdates);
                    if (blockUpdates.length > 0) {
                        cards.push({
                            title: blockUpdates.length === 1 ? "Field Updated" : `${blockUpdates.length} Fields Updated`,
                            lines: blockUpdates.map((u) => `${labelForField(u.field)} -> ${u.value}`),
                        });
                    }
                    continue;
                }

                const actionCard = await applyStructuredAction(block);
                if (actionCard) cards.push(actionCard);
            }

            return {
                cleanText: stripActionBlocks(rawResponse) || "Done.",
                updates,
                cards,
            };
        },
        [applyActionFields, applyStructuredAction]
    );

    const handleAnythingLLMSend = async (
        text: string,
        recentMessages: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<string> => {
        try {
            const screenContext: ScreenContext | undefined = formFillContext ? getScreenContext(formFillContext, currentStep) : undefined;

            const res = await fetch("/api/copilot/propose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, message: text, conversationStage, collectedData, screenContext, chatHistory: recentMessages.slice(-20) }),
            });

            const data = await res.json();

            if (data.actions && data.actions.length > 0 && formFillContext) executeActions(formFillContext, data.actions as StageAction[]);

            if (data.screenActions && data.screenActions.length > 0 && formFillContext) {
                const result = executeScreenActions(formFillContext, data.screenActions as ScreenAction[]);
                if (result.downloadPdf) {
                    setTimeout(() => {
                        const exportBtn = document.querySelector('[data-copilot-export]') as HTMLButtonElement;
                        if (exportBtn) exportBtn.click();
                    }, 1000);
                }
                if (result.navigateStep !== undefined && onNavigateStep) onNavigateStep(result.navigateStep);
            }

            if (data.nextStage) setConversationStage(data.nextStage as ConversationStage);
            if (data.collected) setCollectedData(data.collected);

            const reply = data.reply || data.error || "No reply from AI backend.";
            setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: reply }]);
            return reply;
        } catch (err: any) {
            console.error("[Copilot] AnythingLLM error:", err);
            return `Error: ${err?.message || String(err)}`;
        }
    };

    const handleStreamingSend = async (text: string) => {
        const assistantId = newId();
        setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: "", thinking: "", isThinking: false, timestamp: Date.now() },
        ]);

        try {
            const res = await fetch("/api/copilot/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, message: text, useAgent: text.startsWith("@agent") }),
            });

            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => null);
                const msg = data?.error || "AI request failed. Try again.";
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: msg } : m)));
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            let thinkBuf = "";
            let answerBuf = "";
            let inThink = false;

            const updateMsg = (partial: Partial<ChatMessage>) => {
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...partial } : m)));
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");
                let streamDone = false;

                for (const line of lines) {
                    if (streamDone) break;
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;

                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        if (parsed.error) {
                            answerBuf += `Error: ${parsed.error}`;
                            streamDone = true;
                            break;
                        }
                        if (parsed.close) {
                            streamDone = true;
                            break;
                        }
                        if (!parsed.textResponse) continue;

                        let token = parsed.textResponse as string;
                        while (token.length > 0) {
                            if (!inThink) {
                                const openIdx = token.indexOf("<think>");
                                if (openIdx === -1) {
                                    answerBuf += token;
                                    token = "";
                                } else {
                                    answerBuf += token.slice(0, openIdx);
                                    token = token.slice(openIdx + 7);
                                    inThink = true;
                                    updateMsg({ isThinking: true, content: answerBuf, thinking: thinkBuf });
                                }
                            } else {
                                const closeIdx = token.indexOf("</think>");
                                if (closeIdx === -1) {
                                    thinkBuf += token;
                                    token = "";
                                } else {
                                    thinkBuf += token.slice(0, closeIdx);
                                    token = token.slice(closeIdx + 8);
                                    inThink = false;
                                    updateMsg({ isThinking: false, content: answerBuf, thinking: thinkBuf });
                                }
                            }
                        }

                        updateMsg({ content: answerBuf, thinking: thinkBuf, isThinking: inThink });
                    } catch {
                        // ignore non-json chunks
                    }
                }

                if (streamDone) break;
            }

            const processed = await processAssistantResponse(answerBuf.trim() || "No response received.");
            setMessages((prev) => {
                const next = prev.map((m) =>
                    m.id === assistantId
                        ? {
                            ...m,
                            content: processed.cleanText,
                            thinking: thinkBuf || undefined,
                            isThinking: false,
                            actionUpdates: processed.updates.length > 0 ? processed.updates : undefined,
                            actionCards: processed.cards.length > 0 ? processed.cards : undefined,
                        }
                        : m
                );
                void persistChatState(next);
                return next;
            });
        } catch (err: any) {
            setMessages((prev) => {
                const next = prev.map((m) => (m.id === assistantId ? { ...m, content: `Stream error: ${err?.message || String(err)}` } : m));
                void persistChatState(next);
                return next;
            });
        }
    };

    const handleSend = async (forcedText?: string) => {
        const text = (forcedText ?? input).trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = { id: newId(), role: "user", content: text, timestamp: Date.now() };
        const nextAfterUser = [...messages, userMsg];
        setMessages(nextAfterUser);
        void persistChatState(nextAfterUser);
        setInput("");
        setIsLoading(true);

        try {
            const brain = formFillContext ? routeMessage(text) : "anythingllm";
            let response: string;

            if (formFillContext && conversationStage !== ConversationStage.DONE) {
                const llmHistory = nextAfterUser
                    .filter((m) => m.role === "user" || m.role === "assistant")
                    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
                response = await handleAnythingLLMSend(text, llmHistory);
            } else if (projectId && projectId !== "new") {
                await handleStreamingSend(text);
                setIsLoading(false);
                return;
            } else if (onSendMessage) {
                response = await onSendMessage(text, [...messages, userMsg]);
            } else {
                response = "AI backend not connected. Save the project first to enable AI chat.";
            }

            const processed = await processAssistantResponse(response);
            const assistantMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                content: processed.cleanText,
                timestamp: Date.now(),
                actionUpdates: processed.updates.length > 0 ? processed.updates : undefined,
                actionCards: processed.cards.length > 0 ? processed.cards : undefined,
            };
            setMessages((prev) => {
                const next = [...prev, assistantMsg];
                void persistChatState(next);
                return next;
            });
        } catch (err: any) {
            const errorMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                content: `Error: ${err?.message || String(err)}`,
                timestamp: Date.now(),
            };
            setMessages((prev) => {
                const next = [...prev, errorMsg];
                void persistChatState(next);
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const onMessagesScroll = () => {
        if (!viewportRef.current) return;
        const el = viewportRef.current;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
        setIsAtBottom(nearBottom);
        if (nearBottom) setNewMessageCount(0);
    };

    const createArchivedConversation = useCallback((source: ChatMessage[]): ChatConversation | null => {
        const persisted = toPersistedMessages(source);
        if (persisted.length === 0) return null;
        return {
            id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            title: buildConversationTitle(source),
            createdAt: Date.now(),
            messages: persisted.slice(-50),
        };
    }, [buildConversationTitle, toPersistedMessages]);

    const handleNewChat = useCallback(async () => {
        const archived = createArchivedConversation(messages);
        const nextConversations = archived
            ? [...chatConversations, archived].slice(-20)
            : chatConversations;

        setChatConversations(nextConversations);
        setActiveConversationId(null);
        setMessages([]);
        setConversationHistory([]);
        setConversationStage(ConversationStage.GREETING);
        setCollectedData(createInitialState().collected);
        try {
            await persistChatState([], nextConversations);
        } catch (error) {
            console.error("[Copilot] Failed to persist new chat state:", error);
        }
    }, [chatConversations, createArchivedConversation, messages, persistChatState]);

    const handleLoadConversation = useCallback(async (conversationId: string) => {
        const selected = chatConversations.find((c) => c.id === conversationId);
        if (!selected) return;
        const restored = normalizeLoadedMessages(selected.messages);
        setMessages(restored);
        setActiveConversationId(conversationId);
        setConversationHistory(
            restored
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        );
        setConversationStage(ConversationStage.GREETING);
        setCollectedData(createInitialState().collected);
        try {
            await persistChatState(restored, chatConversations);
        } catch (error) {
            console.error("[Copilot] Failed to persist loaded conversation:", error);
        }
        requestAnimationFrame(() => scrollToBottom(false));
    }, [chatConversations, normalizeLoadedMessages, persistChatState, scrollToBottom]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    const handleSuggestion = (prompt: string) => {
        void handleSend(prompt);
    };

    const suggestions = useMemo(() => {
        if (!formFillContext) return quickActions?.map((q) => q.prompt) || [];

        const clientName = String(formFillContext.getValues("receiver.name") || "").trim();
        const screens = formFillContext.getValues("details.screens") || [];
        const docMode = String(formFillContext.getValues("details.documentMode") || "").trim();
        const pricingDoc = formFillContext.getValues("details.pricingDocument") as any;
        const sections: Array<{ name?: string }> = Array.isArray(pricingDoc?.tables) ? pricingDoc.tables : [];

        const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() || "";
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content?.toLowerCase() || "";
        const convo = `${lastUser} ${lastAssistant}`;

        const sectionChips = sections.slice(0, 3).map((s, idx) => `Section ${idx + 1}: ${String(s?.name || `Section ${idx + 1}`)}`);

        // Rename/header intent
        if (/(rename|section|header|call it|should be called)/i.test(convo)) {
            return uniqueSuggestions([
                ...sectionChips,
                sections[0]?.name ? `Rename "${sections[0].name}" to Concourse LED Display System` : "",
                "Rename section 1 to Concourse LED Display System",
                "Rename section 2 to Ribbon Display",
            ]).slice(0, 3);
        }

        // Typo/fix text intent
        if (/(typo|misspell|fix|correct|replace|sturcutral|description)/i.test(convo)) {
            return uniqueSuggestions([
                `Fix typo: "Sturcutral" -> "Structural"`,
                `Change "Submittals, Engineering, and Permits" to "Engineering & Permits" everywhere`,
                "Update line 4 in section 1 to Structural Materials",
            ]).slice(0, 3);
        }

        // Document mode intent
        if (/(loi|budget|proposal|document mode)/i.test(convo)) {
            return uniqueSuggestions(["Switch to LOI", "Switch to Proposal", "Switch to Budget"]).slice(0, 3);
        }

        // Preview/export intent
        if (/(preview|pdf|export|download)/i.test(convo)) {
            return uniqueSuggestions(["Preview PDF", "Summarize project", "Switch to LOI"]).slice(0, 3);
        }

        // Fallback (state-driven)
        if (!clientName) return ["Start a new proposal", "What can you do?", "Fill client info"];
        if (screens.length === 0) return ["Add display specs", "Set pricing", "Look up address"];
        if (docMode) return ["Preview PDF", "Summarize project", "Switch to LOI"];
        return ["Set document mode", "Summarize project", "Look up address"];
    }, [formFillContext, quickActions, messages]);

    return (
        <>
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-8 right-8 z-50 flex items-center gap-2.5 rounded-full border-2 border-white/30 px-5 py-3.5 text-white shadow-2xl transition-all hover:scale-105"
                    style={{ backgroundColor: "#0055B3" }}
                    title="Open Lux"
                >
                    <MessageSquare className="h-6 w-6" />
                    <span className="text-sm font-bold tracking-wide">Lux</span>
                </button>
            )}

            {isOpen && <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setIsOpen(false)} />}

            <div
                data-copilot-panel
                className={cn(
                    "fixed right-0 top-0 z-50 flex h-full max-w-[450px] flex-col border-l border-zinc-200 bg-white transition-transform duration-300 ease-out",
                    isOpen ? "translate-x-0" : "translate-x-full",
                    className
                )}
                style={{ width: "clamp(380px, 30vw, 450px)", boxShadow: "-10px 0 30px rgba(0,0,0,0.12)" }}
            >
                <div className="h-1.5 w-full bg-gradient-to-r from-[#0055B3] to-[#2E87E5]" />

                <div className="flex items-start justify-between border-b border-zinc-200 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-[#0055B3]/10 p-1.5">
                            <Zap className="h-4 w-4 text-[#0055B3]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-zinc-900">Lux</h3>
                            <p className="text-[11px] text-zinc-500">ANC's AI copilot</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => void handleNewChat()}
                            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                            title="New chat"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                            title="Minimize"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                            title="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <>
                        <div
                            ref={viewportRef}
                            onScroll={onMessagesScroll}
                            className="relative flex-1 overflow-y-auto bg-gradient-to-b from-white to-[#F8FAFC] px-3 py-4"
                        >
                            {messages.length === 0 ? (
                                <div className="space-y-3">
                                    {chatConversations.length > 0 && (
                                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                                Previous conversations
                                            </div>
                                            <div className="space-y-1.5">
                                                {chatConversations
                                                    .slice()
                                                    .reverse()
                                                    .slice(0, 5)
                                                    .map((conv) => (
                                                        <button
                                                            key={conv.id}
                                                            onClick={() => void handleLoadConversation(conv.id)}
                                                            className={cn(
                                                                "w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                                                                activeConversationId === conv.id
                                                                    ? "border-[#0055B3]/40 bg-[#0055B3]/5 text-[#0055B3]"
                                                                    : "border-zinc-200 hover:bg-zinc-50"
                                                            )}
                                                        >
                                                            <div className="font-medium truncate">{conv.title}</div>
                                                            <div className="mt-0.5 text-[10px] text-zinc-500">
                                                                {new Date(conv.createdAt).toLocaleString()}
                                                            </div>
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm animate-[copilot-message-in_200ms_ease-out]">
                                        <div className="mb-2 text-sm font-semibold text-zinc-900">⚡ Hey — I'm Lux.</div>
                                        <div className="space-y-1 text-xs text-zinc-700">
                                            <p>I work with the ANC proposal team.</p>
                                            <p>Drop me an Excel, tell me about a project, or just ask me something.</p>
                                        </div>
                                        <p className="mt-3 text-xs text-zinc-600">What are we working on?</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {messages.map((msg) => {
                                        const isUser = msg.role === "user";
                                        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                                        return (
                                            <div
                                                key={msg.id}
                                                className={cn(
                                                    "group animate-[copilot-message-in_200ms_ease-out]",
                                                    isUser ? "ml-10 flex justify-end" : "mr-10"
                                                )}
                                            >
                                                <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
                                                    <div
                                                        className={cn(
                                                            "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                                                            isUser ? "bg-[#0055B3] text-white" : "bg-[#0055B3] text-white"
                                                        )}
                                                        title={isUser ? "You" : "Lux"}
                                                    >
                                                        {isUser ? "YO" : "L"}
                                                    </div>

                                                    <div className="max-w-[88%]">
                                                        <div
                                                            className={cn(
                                                                "rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed",
                                                                isUser
                                                                    ? "rounded-br-md bg-[#0055B3] text-white"
                                                                    : "rounded-bl-md bg-[#F3F4F6] text-zinc-900"
                                                            )}
                                                        >
                                                            {!isUser && (msg.thinking || msg.isThinking) && (
                                                                <ThinkingBlock thinking={msg.thinking || ""} isStreaming={!!msg.isThinking} />
                                                            )}
                                                            {isUser ? (
                                                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                                            ) : (
                                                                <div className="prose prose-sm max-w-none [&>p]:my-0 [&>ul]:my-1 [&>ol]:my-1 [&>li]:my-0">
                                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {msg.actionCards && msg.actionCards.length > 0 && (
                                                            <div className="mt-2 ml-2 space-y-2">
                                                                {msg.actionCards.map((card, cardIdx) => (
                                                                    <div
                                                                        key={`${msg.id}-card-${cardIdx}`}
                                                                        className="rounded-lg border-l-4 border-green-500 bg-green-50 px-3 py-2 text-[11px] text-zinc-800 animate-[copilot-action-in_220ms_ease-out]"
                                                                    >
                                                                        <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-green-700">
                                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                                            {card.title}
                                                                        </div>
                                                                        {card.lines.map((line, lineIdx) => (
                                                                            <div key={`${msg.id}-card-${cardIdx}-line-${lineIdx}`} className="truncate">
                                                                                {line}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="mt-1 hidden text-[10px] text-zinc-400 group-hover:block">{time}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {isLoading && (
                                        <div className="mr-10 animate-[copilot-message-in_200ms_ease-out]">
                                            <div className="flex gap-2">
                                                <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#0055B3] text-[10px] font-semibold text-white">L</div>
                                                <TypingIndicator />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div ref={messagesEndRef} />

                            {!isAtBottom && newMessageCount > 0 && (
                                <button
                                    onClick={() => {
                                        setIsAtBottom(true);
                                        setNewMessageCount(0);
                                        scrollToBottom();
                                    }}
                                    className="sticky bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#0055B3]/30 bg-white px-3 py-1 text-xs text-[#0055B3] shadow"
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                    {newMessageCount} new message{newMessageCount > 1 ? "s" : ""}
                                </button>
                            )}
                        </div>

                        {messages.length > 0 && (
                            <div className="border-t border-zinc-200 bg-white px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                    {suggestions.slice(0, 3).map((chip) => (
                                        <button
                                            key={chip}
                                            onClick={() => handleSuggestion(chip)}
                                            className="rounded-full border border-[#0055B3]/50 px-3 py-1 text-xs text-[#0055B3] transition-colors hover:bg-[#0055B3]/5"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border-t border-zinc-200 bg-white p-3">
                            <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-2 py-2 focus-within:border-[#0055B3] focus-within:ring-2 focus-within:ring-[#0055B3]/20">
                                {isMicSupported ? (
                                    <button
                                        onClick={() => {
                                            if (isListening) stopListening();
                                            else {
                                                resetTranscript();
                                                setInput("");
                                                startListening();
                                            }
                                        }}
                                        disabled={isLoading}
                                        className={cn(
                                            "rounded-full p-2 transition-colors",
                                            isListening
                                                ? "bg-red-500 text-white"
                                                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                                        )}
                                        title={isListening ? "Stop recording" : "Voice input"}
                                    >
                                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                    </button>
                                ) : (
                                    <div className="rounded-full p-2 text-zinc-400">
                                        <Mic className="h-4 w-4" />
                                    </div>
                                )}

                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isListening ? "Listening..." : "Ask me anything or tell me about the project..."}
                                    rows={1}
                                    className="max-h-[120px] min-h-[44px] flex-1 resize-none bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                                />

                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || isLoading}
                                    className={cn(
                                        "rounded-full p-2.5 transition-all",
                                        input.trim() && !isLoading
                                            ? "bg-[#0055B3] text-white hover:bg-[#00438f]"
                                            : "bg-zinc-200 text-zinc-400"
                                    )}
                                >
                                    <Send className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                </>
            </div>
        </>
    );
}
