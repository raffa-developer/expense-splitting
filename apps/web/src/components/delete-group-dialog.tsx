import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, type GroupDetail } from "@/api";
import { notifyGroupsChanged } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { errorMessage, useI18n } from "@/lib/i18n";

export function DeleteGroupDialog({
  group,
  open,
  onOpenChange
}: {
  group: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await api.deleteGroup(group.id);
      toast.success(t("group.deleted"));
      notifyGroupsChanged();
      onOpenChange(false);
      navigate("/groups");
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("group.deleteTitle", { name: group.name })}</DialogTitle>
          <DialogDescription>{t("group.deleteDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void confirm()}
          >
            <Trash2 className="size-4" />
            {deleting ? t("common.deleting") : t("group.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
