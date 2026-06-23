import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/queries/settings";
import { listCategories } from "@/lib/queries/categories";
import { getCompanySettings } from "@/lib/queries/company";
import SettingsForm from "@/app/components/SettingsForm";
import CategoriesManager from "@/app/components/CategoriesManager";
import CompanyDetailsForm from "@/app/components/CompanyDetailsForm";
import PushToggle from "@/app/components/PushToggle";
import { IconChevronRight } from "@/app/components/icons";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, categories, company] = await Promise.all([
    getSettings(user.id),
    listCategories(user.id),
    getCompanySettings(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <CompanyDetailsForm company={company} canEdit={can(user, "admin")} />
      <SettingsForm settings={settings} />
      <CategoriesManager categories={categories} />
      <PushToggle />

      <Link
        href="/telegram"
        className="card tap flex items-center justify-between p-5 hover:border-brand"
      >
        <div>
          <h2 className="text-base font-bold">Telegram Bot</h2>
          <p className="text-sm text-ink-soft">Conectează botul și gestionează din chat.</p>
        </div>
        <IconChevronRight className="size-5 text-brand" />
      </Link>
    </div>
  );
}
