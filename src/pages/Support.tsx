import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  markRestaurantTicketReadByAgent,
  relativeTime,
  sendRestaurantReply,
  setRestaurantTicketStatus,
  subscribeRestaurantTickets,
  subscribeTicketMessages,
  ticketSortKey,
  type SupportMessage,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support.firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifeBuoy, Search, Send, CheckCircle2, RotateCcw, Lock, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CHANNEL_LABELS: Record<string, string> = {
  chat: "Chat",
  email: "Email",
  phone: "Phone",
  in_app: "In-app",
};

const statusStyles: Record<SupportStatus, string> = {
  open: "bg-warning/10 text-warning",
  in_progress: "bg-primary/10 text-primary",
  waiting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  resolved: "bg-success/10 text-success",
};

const priorityStyles: Record<SupportPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
];

const Support = () => {
  const { session, can } = useAuth();
  const restaurantId = session?.restaurantId ?? null;
  const canManageSupport = can("rm.support.manage");

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    const unsub = subscribeRestaurantTickets(restaurantId, (list) => {
      setTickets(list);
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  useEffect(() => {
    if (!selectedId || !restaurantId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    const unsub = subscribeTicketMessages(selectedId, (list) => {
      setMessages(list);
      setMessagesLoading(false);
    });
    void markRestaurantTicketReadByAgent(selectedId, restaurantId).catch(() => {});
    return unsub;
  }, [selectedId, restaurantId]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedTicket?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => statusTab === "all" || t.status === statusTab)
      .filter((t) => {
        if (!q) return true;
        return (
          t.subject.toLowerCase().includes(q) ||
          t.customer_name.toLowerCase().includes(q) ||
          (t.order_number ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => ticketSortKey(b).localeCompare(ticketSortKey(a)));
  }, [tickets, statusTab, search]);

  const unreadTotal = useMemo(
    () => tickets.filter((t) => t.unread_for_agent > 0).length,
    [tickets],
  );

  const handleSend = useCallback(async () => {
    if (!selectedId || !session) return;
    const body = draft.trim();
    if (!body || !canManageSupport) return;
    setSending(true);
    try {
      await sendRestaurantReply({ ticketId: selectedId, session, body });
      setDraft("");
      toast.success("Reply sent to the customer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }, [selectedId, session, draft, canManageSupport]);

  const handleStatus = useCallback(
    async (status: SupportStatus) => {
      if (!selectedId || !session || !canManageSupport) return;
      try {
        await setRestaurantTicketStatus({ ticketId: selectedId, session, status });
        toast.success(status === "resolved" ? "Inquiry resolved" : "Inquiry reopened");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update inquiry");
      }
    },
    [selectedId, session, canManageSupport],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" />
            My Inquiries
          </h1>
          <p className="text-sm text-muted-foreground">
            Support conversations between your customers and the platform — {unreadTotal > 0 ? `${unreadTotal} unread` : "all read"}
          </p>
        </div>
        {!canManageSupport && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            View only — replying requires the support manage permission
          </p>
        )}
      </div>

      {/* Filters — applied after the restaurant filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, customer or order number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading inquiries…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card py-16 flex flex-col items-center justify-center gap-3 text-center animate-fade-in">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold">No inquiries found</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            When your customers raise an issue about this restaurant, it will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setSelectedId(ticket.id)}
              className={`w-full text-left glass-card p-4 transition-all duration-200 hover:border-primary/40 ${
                ticket.unread_for_agent > 0 ? "border-l-4 border-l-primary" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ticket.unread_for_agent > 0 && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
                    )}
                    <span className="font-semibold text-sm truncate">
                      {ticket.subject || "(no subject)"}
                    </span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${statusStyles[ticket.status]}`}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${priorityStyles[ticket.priority]}`}>
                      {ticket.priority}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
                    {ticket.last_message ?? "No messages yet"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{ticket.customer_name}</span>
                    <span>·</span>
                    <span>{CHANNEL_LABELS[ticket.channel]}</span>
                    {ticket.order_number && (
                      <>
                        <span>·</span>
                        <span className="font-mono">{ticket.order_number}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-muted-foreground">{relativeTime(ticketSortKey(ticket))}</p>
                  {ticket.unread_for_agent > 0 && (
                    <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {ticket.unread_for_agent}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Thread dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 normal-case text-base">
                  <span>{selectedTicket.subject || "(no subject)"}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${statusStyles[selectedTicket.status]}`}>
                    {selectedTicket.status.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${priorityStyles[selectedTicket.priority]}`}>
                    {selectedTicket.priority}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <p className="text-muted-foreground text-[10px]">Customer</p>
                  <p className="font-medium truncate">{selectedTicket.customer_name}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <p className="text-muted-foreground text-[10px]">Channel</p>
                  <p className="font-medium">{CHANNEL_LABELS[selectedTicket.channel]}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <p className="text-muted-foreground text-[10px]">Order</p>
                  <p className="font-medium font-mono truncate">{selectedTicket.order_number ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <p className="text-muted-foreground text-[10px]">Assigned (console)</p>
                  <p className="font-medium truncate">{selectedTicket.assigned_name ?? "Unassigned"}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Priority and assignment are managed by the Hearth support team.
              </p>

              <ScrollArea className="flex-1 min-h-0 max-h-[38vh] pr-3">
                <div className="space-y-3 py-2">
                  {messagesLoading ? (
                    <p className="text-center py-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="text-center py-6 text-sm text-muted-foreground">No messages yet</p>
                  ) : (
                    messages.map((m) =>
                      m.from === "system" ? (
                        <p key={m.id} className="text-center text-[11px] text-muted-foreground">
                          {m.body}
                        </p>
                      ) : (
                        <div
                          key={m.id}
                          className={`flex flex-col ${m.from === "agent" ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                              m.from === "agent"
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          </div>
                          <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                            {m.author_name} · {relativeTime(m.at)}
                          </p>
                        </div>
                      ),
                    )
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-border pt-3 space-y-2">
                <Textarea
                  placeholder={
                    canManageSupport
                      ? "Write a reply to the customer…"
                      : "View only — ask a manager or the platform to grant support manage access"
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!canManageSupport}
                  rows={3}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && canManageSupport && draft.trim()) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {selectedTicket.status === "resolved" ? (
                      <Button size="sm" variant="outline" onClick={() => void handleStatus("in_progress")} disabled={!canManageSupport}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-success" onClick={() => void handleStatus("resolved")} disabled={!canManageSupport}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                  <Button size="sm" onClick={() => void handleSend()} disabled={!canManageSupport || !draft.trim() || sending}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Support;
