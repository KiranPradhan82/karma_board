'use client';

import { useState, useCallback } from 'react';
import { ErrorDetailDialog } from '@/components/error-detail-dialog';

interface ErrorInfo {
  title: string;
  error: string;
  details?: string;
}

export function useApiError() {
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  const showError = useCallback((title: string, error: string, details?: string) => {
    setErrorInfo({ title, error, details });
  }, []);

  const clearError = useCallback(() => {
    setErrorInfo(null);
  }, []);

  const ErrorDetailDialogEl = (
    <ErrorDetailDialog
      open={!!errorInfo}
      onOpenChange={(open) => {
        if (!open) clearError();
      }}
      title={errorInfo?.title || 'Error'}
      error={errorInfo?.error || 'An unknown error occurred'}
      details={errorInfo?.details}
    />
  );

  return {
    errorInfo,
    showError,
    clearError,
    ErrorDetailDialog: ErrorDetailDialogEl,
  };
}
