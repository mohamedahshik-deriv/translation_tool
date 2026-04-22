import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-gradient-to-r from-sky-400 to-blue-500 text-white border-0 shadow-md shadow-blue-200/50 hover:brightness-110 hover:shadow-lg hover:shadow-blue-300/50 hover:scale-[1.02] active:scale-[0.98]",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline:
                    "bg-white/55 backdrop-blur-sm border border-white/70 text-foreground hover:bg-white/75 transition-all shadow-sm",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-white/45 text-foreground",
                link: "text-primary underline-offset-4 hover:underline",
                gradient:
                    "bg-gradient-to-r from-sky-400 to-blue-500 text-white border-0 shadow-md shadow-blue-200/50 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] glow-primary-hover",
                accent:
                    "bg-gradient-to-r from-orange-400 to-pink-500 text-white border-0 shadow-md shadow-pink-200/50 hover:brightness-110 hover:shadow-lg hover:shadow-pink-300/50 hover:scale-[1.02] active:scale-[0.98]",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-11 rounded-lg px-8",
                xl: "h-12 rounded-lg px-10 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
