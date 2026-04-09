'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const router = useRouter();

  useEffect(() => {
    if (open) {
      onOpenChange(false);
      router.push('/login');
    }
  }, [open, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome to PriceOS</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4">
          <Button onClick={() => { onOpenChange(false); router.push('/login'); }}>
            Sign In
          </Button>
          <Button variant="outline" onClick={() => { onOpenChange(false); router.push('/login?tab=signup'); }}>
            Create Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
