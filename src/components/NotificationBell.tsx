import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { getNotifications, markAllRead, markRead } from "@/api/notifications.api";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Compact inbox wired to the existing /notifications API.
 * Shown for any authenticated role; each user only sees their own items.
 */
export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications();
      setItems(data.notifications);
      setUnread(data.unread);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getNotifications();
        if (!active) return;
        setItems(data.notifications);
        setUnread(data.unread);
      } catch {
        /* bell is best-effort on mount */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const onOpenToggle = () => setOpen((v) => !v);

  const onItemClick = async (n: Notification) => {
    try {
      if (!n.read) {
        await markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnread((u) => Math.max(0, u - 1));
      }
    } catch {
      /* still navigate */
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const onMarkAll = async () => {
    try {
      await markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={onOpenToggle}
        title="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-fog transition-colors hover:bg-ink/[0.05] hover:text-ink"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-gold-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded border border-border bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-xs font-semibold text-navy">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={onMarkAll} className="text-[11px] font-medium text-gold hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {loading && items.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</li>
              )}
              {!loading && items.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet.</li>
              )}
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(n)}
                    className={cn(
                      "w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50",
                      !n.read && "bg-secondary/30"
                    )}
                  >
                    <p className={cn("text-xs text-navy", !n.read && "font-semibold")}>{n.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(n.at).toLocaleString("en-IN")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
