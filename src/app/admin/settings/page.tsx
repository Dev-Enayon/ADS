import { PageHeader } from "@/components/advertiser/cards";
import { getAdminSession } from "@/lib/auth/admin";
import { listSettings } from "@/services/admin/settings";
import { SettingEditor } from "@/components/admin/actions";
import { SettingsIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await getAdminSession();
  const settings = await listSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`${settings.length} platform knobs. DB values win over the defaults shown.`}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SettingsIcon size={16} />
        Platform settings
      </div>

      <div className="mt-3 space-y-3">
        {settings.map((s) => (
          <SettingEditor key={s.key} row={s} />
        ))}
      </div>
    </>
  );
}