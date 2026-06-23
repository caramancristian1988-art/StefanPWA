import { requireUser } from "@/lib/dal";
import { listNotifications } from "@/lib/queries/notifications";
import NotificationsList from "@/app/components/NotificationsList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  return (
    <div className="w-full">
      <NotificationsList items={items} />
    </div>
  );
}
