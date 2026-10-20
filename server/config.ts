import { z } from 'zod';

const settings = z.object({
  MOCK: z.enum(['0', '1']).default('1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  ADO_ORG: z
    .string()
    .regex(/^[A-Za-z0-9-]{0,50}$/)
    .default(''),
  ADO_DEFAULT_PROJECT: z.string().default(''),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = settings.safeParse(env);
  if (!result.success || (result.data.MOCK === '0' && !result.data.ADO_ORG)) {
    throw new Error('Check MOCK, PORT, and ADO_ORG in local settings.');
  }
  return {
    mock: result.data.MOCK === '1',
    port: result.data.PORT,
    organization: result.data.ADO_ORG,
    defaultProject: result.data.ADO_DEFAULT_PROJECT,
  };
}

export type Config = ReturnType<typeof readConfig>;
