import type { ComponentProps } from "react";
import { Link } from "react-router";

type Variant = "primary" | "secondary" | "onDark" | "light" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  primary: "bg-brand-red text-white hover:bg-brand-red-dark",
  secondary: "border-2 border-charcoal text-ink hover:bg-charcoal hover:text-white",
  onDark: "border-2 border-white text-white hover:bg-white hover:text-ink",
  light: "bg-white text-ink hover:bg-canvas",
  danger: "border-2 border-danger text-danger hover:bg-danger hover:text-white",
  ghost: "text-ink underline underline-offset-4 hover:text-brand-red",
};
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-[0.9375rem]",
  lg: "min-h-14 px-7 text-[1.0625rem]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };
export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };
export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}
