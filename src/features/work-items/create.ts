import { createContext, useContext } from 'react';

/** Where a create starts from. All parts are optional. */
export type CreateRequest = { parentId?: number; type?: string; state?: string };

export const CreateContext = createContext<(request?: CreateRequest) => void>(() => {});

/** Opens the shared create form. */
export const useCreate = () => useContext(CreateContext);
