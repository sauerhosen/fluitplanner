"use client";

import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";

/** The sentinel the radio group carries for "don't filter at all". */
const ALL = "__all__";

type Props = {
  umpires: { id: string; name: string }[];
  focusedUmpireId: string | null;
  onFocusedUmpireChange: (umpireId: string | null) => void;
  /**
   * "button" is the toolbar's own trigger; "menu" folds the same choice into a
   * submenu of an enclosing dropdown, which is how a phone reaches it.
   */
  variant?: "button" | "menu";
  className?: string;
};

/**
 * Narrow the assignment grid to one umpire.
 *
 * A planner talking to a single umpire wants the same grid they read all
 * season — the match header, that umpire's availability, their appointments —
 * with everyone else's rows gone, so the screenshot they paste into a message
 * is about one person. Filtering happens on the page, not in the grid: the
 * counts, conflicts and fill bars keep counting the whole roster, so a focused
 * grid still tells the truth about how full a match is.
 */
export function UmpireFocusMenu({
  umpires,
  focusedUmpireId,
  onFocusedUmpireChange,
  variant = "button",
  className,
}: Props) {
  const t = useTranslations("polls");
  const focused = umpires.find((u) => u.id === focusedUmpireId);

  function handleChange(value: string) {
    onFocusedUmpireChange(value === ALL ? null : value);
  }

  const items = (
    <DropdownMenuRadioGroup
      value={focused?.id ?? ALL}
      onValueChange={handleChange}
    >
      <DropdownMenuRadioItem value={ALL}>
        {t("allUmpires")}
      </DropdownMenuRadioItem>
      {umpires.length > 0 && <DropdownMenuSeparator />}
      {umpires.map((u) => (
        <DropdownMenuRadioItem key={u.id} value={u.id}>
          {u.name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  // A club's roster outgrows the viewport well before it outgrows the poll, so
  // the list scrolls rather than running off the bottom of the screen.
  const listClass = "max-h-[60vh] overflow-y-auto";

  if (variant === "menu") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          inset
          className={className}
          data-testid="umpire-focus-menu-item"
        >
          <User className="mr-2 h-4 w-4" />
          {focused ? focused.name : t("focusUmpire")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className={listClass}>
          {items}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={focused ? "default" : "outline"}
          size="sm"
          className={className}
          title={t("focusUmpireHint")}
          data-testid="umpire-focus-menu"
        >
          <User className="mr-2 h-4 w-4" />
          <span className="max-w-32 truncate">
            {focused ? focused.name : t("focusUmpire")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={listClass}>
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
