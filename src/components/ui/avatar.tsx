import { useState } from 'react';
import type { Identity } from '../../../shared/contracts';

/** An identity's avatar through the local avatar route, with an initial as fallback. */
export function Avatar({ identity, size = 22 }: { identity: Identity | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!identity) return <span className="avatar avatar-empty" style={style} aria-hidden="true" />;
  return failed ? (
    <span className="avatar" style={style} aria-hidden="true">
      {identity.displayName.charAt(0)}
    </span>
  ) : (
    <img
      className="avatar"
      style={style}
      src={`/api/avatars/${encodeURIComponent(identity.id)}`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
