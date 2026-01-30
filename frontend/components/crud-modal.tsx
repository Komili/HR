import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Check } from 'lucide-react';

interface CrudModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  isSaving: boolean;
}

export function CrudModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  onSave,
  isSaving,
}: CrudModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] rounded-3xl border-0 bg-white/95 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 p-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-3xl" />

        <DialogHeader className="relative px-6 pt-6 pb-4 border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        <div className="relative px-6 py-6">{children}</div>

        <DialogFooter className="relative px-6 pb-6 pt-2 gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="h-11 px-5 rounded-xl border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
          >
            <X className="mr-2 h-4 w-4" />
            Отмена
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Сохранение...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Сохранить
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
