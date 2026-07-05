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
      className={cn(
        "font-display text-[17px] font-bold tracking-[-0.03em] text-neutral-950 sm:text-[19px]",
        className,
      )}
    >
      DigitalSkill<span className="text-brand">X</span>
    </Link>
  );
}
