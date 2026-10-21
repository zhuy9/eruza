import { createContext, useContext } from 'react';

/** Where a create starts from. All parts are optional. `project` is the parent's project. */
export type CreateRequest = { parentId?: number; project?: string; type?: string; state?: string };

export const CreateContext = createContext<(request?: CreateRequest) => void>(() => {});

/** Opens the shared create form. */
export const useCreate = () => useContext(CreateContext);
