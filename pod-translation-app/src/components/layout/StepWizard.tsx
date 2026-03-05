"use client";

import { motion } from "framer-motion";
import { Check, Upload, Scan, Type, Languages, Mic, Film, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_STEPS, AppStep } from "@/types";
import { useAppStore } from "@/store/app-store";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Upload,
    Scan,
    Type,
    Languages,
    Mic,
    Film,
    Download,
};

const stepOrder: AppStep[] = ['upload', 'analyze', 'edit-text', 'translate', 'dub', 'outro', 'export'];

export function StepWizard() {
    const { currentStep, setCurrentStep } = useAppStore();

    const currentIndex = stepOrder.indexOf(currentStep);

    const getStepStatus = (stepId: AppStep) => {
        const stepIndex = stepOrder.indexOf(stepId);
        if (stepIndex < currentIndex) return 'completed';
        if (stepIndex === currentIndex) return 'current';
        return 'pending';
    };

    const handleStepClick = (stepId: AppStep) => {
        const stepIndex = stepOrder.indexOf(stepId);
        // Only allow navigating to completed steps
        if (stepIndex < currentIndex) {
            setCurrentStep(stepId);
        }
    };

    return (
        <div className="w-full px-4 py-3">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
                {APP_STEPS.map((step, index) => {
                    const status = getStepStatus(step.id);
                    const Icon = iconMap[step.icon];
                    const isLast = index === APP_STEPS.length - 1;

                    return (
                        <div key={step.id} className="flex items-center flex-1 last:flex-none">
                            {/* Step indicator */}
                            <motion.button
                                onClick={() => handleStepClick(step.id)}
                                className={cn(
                                    "relative flex flex-col items-center gap-1.5 group",
                                    status === 'completed' && "cursor-pointer",
                                    status === 'pending' && "cursor-default opacity-50",
                                )}
                                whileHover={status === 'completed' ? { scale: 1.05 } : {}}
                                whileTap={status === 'completed' ? { scale: 0.95 } : {}}
                            >
                                <div
                                    className={cn(
                                        "step-indicator relative",
                                        status === 'completed' && "completed",
                                        status === 'current' && "current",
                                        status === 'pending' && "pending",
                                    )}
                                >
                                    {status === 'completed' ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        Icon && <Icon className="w-4 h-4" />
                                    )}

                                    {/* Glow effect for current step */}
                                    {status === 'current' && (
                                        <motion.div
                                            className="absolute inset-0 rounded-full bg-primary/30"
                                            animate={{
                                                scale: [1, 1.3, 1],
                                                opacity: [0.5, 0, 0.5],
                                            }}
                                            transition={{
                                                duration: 2,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    )}
                                </div>

                                <span
                                    className={cn(
                                        "text-xs font-medium hidden sm:block",
                                        status === 'completed' && "text-primary",
                                        status === 'current' && "text-foreground",
                                        status === 'pending' && "text-muted-foreground",
                                    )}
                                >
                                    {step.label}
                                </span>
                            </motion.button>

                            {/* Connector line */}
                            {!isLast && (
                                <div className="flex-1 mx-2 h-[2px] relative">
                                    <div className="absolute inset-0 bg-muted rounded-full" />
                                    <motion.div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-full"
                                        initial={{ width: "0%" }}
                                        animate={{
                                            width: status === 'completed' ? "100%" : status === 'current' ? "50%" : "0%",
                                        }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
