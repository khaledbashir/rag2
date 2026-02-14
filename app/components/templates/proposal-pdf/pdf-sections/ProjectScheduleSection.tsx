import React from "react";
import type { TemplateColors, TemplateSpacing } from "./types";
import SectionHeader from "./SectionHeader";

interface ScheduleTask {
    taskName?: string;
    phase?: string;
    locationName?: string;
    startDate?: string;
    endDate?: string;
    durationDays?: number;
    isParallel?: boolean;
}

interface ProjectScheduleSectionProps {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    generatedSchedule: {
        tasks?: ScheduleTask[];
        completionDate?: string;
        totalDurationDays?: number;
    };
    ntpDate?: string;
}

const ProjectScheduleSection = ({ colors, spacing, generatedSchedule, ntpDate }: ProjectScheduleSectionProps) => {
    const tasks = Array.isArray(generatedSchedule?.tasks) ? generatedSchedule.tasks : [];
    if (tasks.length === 0) return null;

    const completionLabel = generatedSchedule?.completionDate;
    const totalDuration = Number(generatedSchedule?.totalDurationDays || 0);
    const phaseOrder = ["design", "manufacturing", "shipping", "install"];
    const grouped = phaseOrder.map((phase) => ({
        phase,
        tasks: tasks.filter((task) => (task?.phase || "").toString().toLowerCase() === phase),
    })).filter((group) => group.tasks.length > 0);
    let taskNumber = 0;

    return (
        <div data-preview-section="schedule" className="mt-2 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <SectionHeader title="Project Schedule" subtitle="Generated from NTP date and screen configuration" colors={colors} spacing={spacing} />
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: colors.primaryLight, color: colors.primaryDark }}>
                    <div className="col-span-4">NTP: {ntpDate || "—"}</div>
                    <div className="col-span-4 text-center">Completion: {completionLabel || "—"}</div>
                    <div className="col-span-4 text-right">Duration: {totalDuration > 0 ? `${totalDuration} business days` : "—"}</div>
                </div>

                <div className="grid grid-cols-12 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b-2" style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}>
                    <div className="col-span-1">#</div>
                    <div className="col-span-4">Task</div>
                    <div className="col-span-2">Location</div>
                    <div className="col-span-2">Start</div>
                    <div className="col-span-2">End</div>
                    <div className="col-span-1 text-right">Days</div>
                </div>

                {grouped.map((group) => (
                    <React.Fragment key={`phase-${group.phase}`}>
                        <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-t" style={{ borderColor: colors.borderLight, background: colors.surface, color: colors.primaryDark }}>
                            {group.phase}
                        </div>
                        {group.tasks.map((task, idx) => {
                            taskNumber += 1;
                            return (
                                <div
                                    key={`${group.phase}-${idx}-${task?.taskName || "task"}`}
                                    className="grid grid-cols-12 px-4 py-2 text-[10px] border-t items-center"
                                    style={{ borderColor: colors.borderLight, background: idx % 2 === 1 ? colors.surface : colors.white }}
                                >
                                    <div className="col-span-1" style={{ color: colors.textMuted }}>{taskNumber}</div>
                                    <div className="col-span-4 font-semibold" style={{ color: colors.text }}>
                                        {task?.isParallel ? "↳ " : ""}{task?.taskName || "Task"}
                                    </div>
                                    <div className="col-span-2" style={{ color: colors.textMuted }}>{task?.locationName || "Global"}</div>
                                    <div className="col-span-2" style={{ color: colors.text }}>{task?.startDate || "—"}</div>
                                    <div className="col-span-2" style={{ color: colors.text }}>{task?.endDate || "—"}</div>
                                    <div className="col-span-1 text-right" style={{ color: colors.text }}>{task?.durationDays ?? "—"}</div>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default ProjectScheduleSection;
