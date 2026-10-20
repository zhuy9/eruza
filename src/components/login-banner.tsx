import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionSchema, type SessionInfo } from '../../shared/contracts';
import { sendJson } from '../lib/api';
import { sessionQuery } from '../lib/queries';
import { Button } from './ui/button';

export function LoginBanner({ session }: { session: SessionInfo }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => sendJson('POST', '/session/retry', {}, sessionSchema),
    onSuccess: async (next) => {
      queryClient.setQueryData(sessionQuery.queryKey, next);
      await queryClient.invalidateQueries();
    },
  });
  return (
    <div role="alert" className="login-banner">
      <div>
        <strong>{session.message ?? 'Eruza is not connected to Azure DevOps.'}</strong>
        {session.loginCommand && (
          <>
            <p>Run this command in a terminal, then retry:</p>
            <code>{session.loginCommand}</code>
            <p className="muted-text">
              If your organization uses a specific tenant, add <code>--tenant &lt;domain&gt;</code>.
            </p>
          </>
        )}
        {retry.isError && <p>{retry.error.message}</p>}
      </div>
      <Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
        {retry.isPending ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}
