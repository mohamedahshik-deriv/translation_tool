"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Upload, Scan, Type, Languages, Mic, Film, Download,
    ChevronDown, ChevronUp, Check, Lock, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { AppStep, APP_STEPS } from "@/types";

interface StepSectionProps {
    step: typeof APP_STEPS[number];
    index: number;
    isActive: boolean;
    isCompleted: boolean;
    isLocked: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Upload,
    Scan,
    Type,
    Languages,
    Mic,
    Film,
    Download,
};

function StepSection({
    step,
    index,
    isActive,
    isCompleted,
    isLocked,
    isExpanded,
    onToggle,
    children
}: StepSectionProps) {
    const Icon = iconMap[step.icon];
    const { isAnalyzing, isTranslating, isGeneratingDubbing, isExporting, video } = useAppStore();

    // Check if this step is currently processing
    const isProcessing =
        (step.id === 'analyze' && isAnalyzing) ||
        (step.id === 'translate' && isTranslating) ||
        (step.id === 'dub' && isGeneratingDubbing) ||
        (step.id === 'export' && isExporting);

    return (
        <motion.div
            layout
            className={cn(
                "rounded-xl border overflow-hidden transition-colors duration-200",
                isActive && !isCompleted && "border-primary/50 bg-surface",
                isCompleted && "border-success/30 bg-success/5",
                isLocked && "border-border/50 bg-muted/20 opacity-60",
                !isActive && !isCompleted && !isLocked && "border-border bg-surface"
            )}
        >
            {/* Header - Always visible */}
            <button
                onClick={onToggle}
                disabled={isLocked}
                className={cn(
                    "w-full flex items-center gap-4 p-4 text-left transition-colors",
                    !isLocked && "hover:bg-muted/30",
                    isLocked && "cursor-not-allowed"
                )}
            >
                {/* Step number/status indicator */}
                <div
                    className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-all",
                        isCompleted && "bg-success text-success-foreground",
                        isActive && !isCompleted && "bg-primary text-primary-foreground",
                        isProcessing && "bg-primary text-primary-foreground animate-pulse",
                        isLocked && "bg-muted text-muted-foreground",
                        !isActive && !isCompleted && !isLocked && "bg-muted text-muted-foreground"
                    )}
                >
                    {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCompleted ? (
                        <Check className="w-4 h-4" />
                    ) : isLocked ? (
                        <Lock className="w-4 h-4" />
                    ) : (
                        Icon && <Icon className="w-4 h-4" />
                    )}
                </div>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className={cn(
                            "font-semibold",
                            isCompleted && "text-success",
                            isActive && !isCompleted && "text-foreground",
                            isLocked && "text-muted-foreground"
                        )}>
                            {step.label}
                        </h3>
                        {isCompleted && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                                Done
                            </span>
                        )}
                        {isProcessing && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                Processing...
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{step.description}</p>
                    {step.id === 'analyze' && video && video.width > 0 && video.height > 0 && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {video.width} × {video.height}
                        </p>
                    )}
                </div>

                {/* Expand/collapse icon */}
                {!isLocked && (
                    <div className="text-muted-foreground">
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                        ) : (
                            <ChevronDown className="w-5 h-5" />
                        )}
                    </div>
                )}
            </button>

            {/* Content - Collapsible */}
            <AnimatePresence initial={false}>
                {isExpanded && !isLocked && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-2 border-t border-border/50">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

interface AccordionWorkflowProps {
    children: React.ReactNode[];
}

export function AccordionWorkflow({ children }: AccordionWorkflowProps) {
    const { currentStep, video, segments } = useAppStore();
    const [expandedSteps, setExpandedSteps] = useState<Set<AppStep>>(new Set(['upload']));

    const stepOrder: AppStep[] = ['upload', 'analyze', 'edit-text', 'translate', 'dub', 'outro', 'export'];
    const currentIndex = stepOrder.indexOf(currentStep);

    const getStepStatus = (stepId: AppStep) => {
        const stepIndex = stepOrder.indexOf(stepId);

        // Determine completion based on actual state
        const isCompleted = (() => {
            switch (stepId) {
                case 'upload': return !!video;
                case 'analyze': return segments.length > 0;
                case 'edit-text': return segments.some(s => s.textLayers.length > 0);
                // Add more completion checks as features are built
                default: return stepIndex < currentIndex;
            }
        })();

        const isActive = stepId === currentStep;
        const isLocked = stepIndex > currentIndex && !isCompleted;

        return { isCompleted, isActive, isLocked };
    };

    const toggleStep = (stepId: AppStep) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) {
                next.delete(stepId);
            } else {
                next.add(stepId);
            }
            return next;
        });
    };

    // Auto-expand current step when it changes
    useState(() => {
        setExpandedSteps(prev => new Set([...prev, currentStep]));
    });

    return (
        <div className="space-y-3">
            {APP_STEPS.map((step, index) => {
                const { isCompleted, isActive, isLocked } = getStepStatus(step.id);
                const isExpanded = expandedSteps.has(step.id);

                return (
                    <StepSection
                        key={step.id}
                        step={step}
                        index={index}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isLocked={isLocked}
                        isExpanded={isExpanded}
                        onToggle={() => toggleStep(step.id)}
                    >
                        {children[index]}
                    </StepSection>
                );
            })}
        </div>
    );
}
