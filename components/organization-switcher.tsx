"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getUserOrganizations,
  switchOrganization,
  type UserOrganization,
} from "@/lib/actions/tenant-actions";

type Props = {
  currentSlug: string | null;
};

export function OrganizationSwitcher({ currentSlug }: Props) {
  const t = useTranslations("organization");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [orgs, setOrgs] = useState<UserOrganization[]>([]);

  useEffect(() => {
    getUserOrganizations().then(setOrgs);
  }, []);

  // Don't render if user has 0 or 1 org
  if (orgs.length <= 1) return null;

  const currentOrg = orgs.find((o) => o.slug === currentSlug);

  function handleSwitch(slug: string) {
    if (slug === currentSlug) return;
    startTransition(async () => {
      await switchOrganization(slug);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="text-xs font-medium gap-1"
        >
          <Building2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {currentOrg?.name ?? t("switchOrganization")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={currentSlug ?? ""}
          onValueChange={handleSwitch}
        >
          {orgs.map((org) => (
            <DropdownMenuRadioItem key={org.slug} value={org.slug}>
              {org.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
