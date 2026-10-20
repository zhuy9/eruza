import { createContext, useContext } from 'react';

export const ToastContext = createContext<(message: string) => void>(() => {});

/** Shows a short message in the app's live region. */
export const useToast = () => useContext(ToastContext);
