import { useState, type FormEvent } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { api, type GroupDetail, type Member, type User } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { errorMessage, useI18n } from "@/lib/i18n";

export function MembersCard({
  group,
  onChanged
}: {
  group: GroupDetail;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [results, setResults] = useState<User[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setSearching(true);
    try {
      const found = await api.searchUsers(email);
      const memberIds = new Set(group.members.map((member) => member.id));
      setResults(found.filter((user) => !memberIds.has(user.id)));
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setSearching(false);
    }
  };

  const add = async (user: User) => {
    try {
      await api.addMember(group.id, user.id);
      toast.success(t("people.added", { name: user.name }));
      setEmail("");
      setResults(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  };

  const remove = async () => {
    if (!pendingRemove) {
      return;
    }
    setRemoving(true);
    try {
      await api.removeMember(group.id, pendingRemove.id);
      toast.success(t("people.removed", { name: pendingRemove.name }));
      setPendingRemove(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="animate-rise border-border/70">
      <CardHeader>
        <CardTitle>{t("people.title")}</CardTitle>
        <CardDescription>
          {group.members.length === 1
            ? t("people.countOne", { count: group.members.length })
            : t("people.countMany", { count: group.members.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {group.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-medium"
                  style={avatarStyle(member.name)}
                >
                  {initialsOf(member.name)}
                </span>
                <span className="truncate font-medium">{member.name}</span>
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                  {member.email}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("people.removeAria", { name: member.name })}
                onClick={() => setPendingRemove(member)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>

        <Separator />

        <form onSubmit={search} className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("people.addPlaceholder")}
            required
          />
          <Button type="submit" variant="outline" disabled={searching}>
            <UserPlus className="size-4" />
            {searching ? "…" : t("people.find")}
          </Button>
        </form>

        {results !== null &&
          (results.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("people.noResults")}
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5"
                >
                  <span className="min-w-0 truncate text-xs">
                    <span className="font-medium">{user.name}</span>{" "}
                    <span className="text-muted-foreground">{user.email}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 shrink-0"
                    onClick={() => void add(user)}
                  >
                    {t("people.add")}
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>

      <Dialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("people.removeTitle", { name: pendingRemove?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("people.removeDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={() => void remove()}
            >
              {removing ? t("common.removing") : t("people.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
