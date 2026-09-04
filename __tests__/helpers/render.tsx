import { render, RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { RoleProvider } from "@/components/shared/role-provider";
import type { MemberRole } from "@/lib/types/domain";

type CustomRenderOptions = Omit<RenderOptions, "wrapper"> & {
  /** Membership role the component renders under. Defaults to planner. */
  role?: MemberRole | null;
};

function makeProviders(role: MemberRole | null) {
  return function AllProviders({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="Europe/Amsterdam"
      >
        <RoleProvider role={role}>{children}</RoleProvider>
      </NextIntlClientProvider>
    );
  };
}

function customRender(
  ui: React.ReactElement,
  { role = "planner", ...options }: CustomRenderOptions = {},
) {
  return render(ui, { wrapper: makeProviders(role), ...options });
}

export { customRender as render };
