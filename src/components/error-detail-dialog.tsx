'use client';

import { useState } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ErrorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  error: string;
  details?: string;
}

export function ErrorDetailDialog({
  open,
  onOpenChange,
  title,
  error,
  details,
}: ErrorDetailDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const timestamp = new Date().toISOString();
    const content = [
      `Error: ${title}`,
      `Message: ${error}`,
      details ? `Details:\n${details}` : '',
      `Timestamp: ${timestamp}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Error details copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Error details for debugging
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error message */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>

          {/* Extended details */}
          {details && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Technical Details
              </p>
              <ScrollArea className="max-h-48 rounded-lg border bg-muted/50 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                  {details}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Details
              </>
            )}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
