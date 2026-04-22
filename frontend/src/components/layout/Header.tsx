"use client";

import { Film } from "lucide-react";
import { StepWizard } from "./StepWizard";

export function Header() {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/50 glass-elevated">
            <div className="flex items-center h-16 px-6">
                {/* Logo */}
                <div className="flex items-center gap-2 mr-8">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 shadow-md shadow-blue-300/40">
                        <Film className="w-5 h-5 text-white" />
                    </div>
                    <div className="hidden md:block">
                        <h1 className="text-sm font-semibold text-foreground">POD Translation</h1>
                        <p className="text-[10px] text-muted-foreground">Automation Tool</p>
                    </div>
                </div>

                {/* Step Wizard */}
                <div className="flex-1">
                    <StepWizard />
                </div>
            </div>
        </header>
    );
}
