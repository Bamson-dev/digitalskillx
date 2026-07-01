import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  href = "/",
  onClick,
}: {
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn("font-display text-lg font-bold tracking-tight text-neutral-900 sm:text-xl", className)}
    >
      DigitalSkill<span className="text-brand">X</span>
    </Link>
  );
}
