import { useQuery } from '@tanstack/react-query';

const API = import.meta.env.VITE_API_URL;

const EVENT_LABELS = {
  created:            'CREATED',
  record_added:       'RECORD ADDED',
  record_removed:     'RECORD REMOVED',
  liked:              'LIKED',
  followed:           'FOLLOWED',
  name_changed:       'RENAMED',
  collaborator_added: 'COLLABORATOR ADDED',
  duplicated:         'DUPLICATED',
};

async function getCollectionLogs() {
  const username = sessionStorage.getItem('user');
  const res = await fetch(`${API}/crates/logs/mine?username=${username}`);
  return res.json();
}

function formatTimestamp(raw) {
  if (!raw) return '??/??/?? ??:??';
  const d = new Date(raw);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yy   = String(d.getFullYear()).slice(2);
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

export default function CollectionLogs() {
  const username = sessionStorage.getItem('user');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['collection-logs', username],
    queryFn: getCollectionLogs,
    enabled: !!username,
  });

  return (
    <div className="font-terminal">

      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-hover flex justify-between items-center">
        <span className="text-amber-mid text-base tracking-widest">
          [LOG] LOGS\ — COLLECTIONS ACTIVITY
        </span>
        <span className="text-amber-dim text-xs tracking-widest hidden sm:block">
          C:\LATE_NIGHT_VIBES\COLLECTIONS\LOGS\
        </span>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-b border-amber-hover flex gap-6 text-xs tracking-widest text-amber-dim">
        <span>USER: <span className="text-amber-mid">{username?.toUpperCase() || '—'}</span></span>
        <span>EVENTS: <span className="text-amber-mid">{logs.length}</span></span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="px-4 py-8 text-amber-muted tracking-widest">
          LOADING...<span className="blink">_</span>
        </div>
      )}

      {/* Not logged in */}
      {!username && (
        <div className="px-4 py-8 text-amber-muted tracking-widest">
          NOT LOGGED IN — PLEASE LOGIN TO VIEW LOGS
        </div>
      )}

      {/* Empty */}
      {!isLoading && username && logs.length === 0 && (
        <div className="px-4 py-8 text-amber-muted tracking-widest">
          NO ACTIVITY YET — START BY CREATING A CRATE IN HDD\
        </div>
      )}

      {/* Log stream */}
      {!isLoading && logs.length > 0 && (
        <div className="divide-y divide-amber-hover">

          {/* Column headers */}
          <div className="px-4 py-2 grid grid-cols-12 gap-2 text-xs tracking-widest text-amber-dim border-b border-amber-hover">
            <span className="col-span-3">TIMESTAMP</span>
            <span className="col-span-3">CRATE</span>
            <span className="col-span-2">EVENT</span>
            <span className="col-span-4">DETAIL</span>
          </div>

          {logs.map((log, i) => (
            <div
              key={log.id ?? i}
              className="px-4 py-2 grid grid-cols-12 gap-2 text-xs tracking-wide hover:bg-amber-hover transition-all"
            >
              {/* Timestamp */}
              <span className="col-span-3 text-amber-dim font-terminal">
                {formatTimestamp(log.created_at)}
              </span>

              {/* Crate name */}
              <span className="col-span-3 text-amber-text truncate">
                {log.crate_name?.toUpperCase() || '—'}
              </span>

              {/* Event type */}
              <span className={`col-span-2 tracking-widest ${
                log.event_type === 'created'        ? 'text-amber-bright' :
                log.event_type === 'record_added'   ? 'text-amber-mid'   :
                log.event_type === 'record_removed' ? 'text-amber-dim'   :
                log.event_type === 'liked'          ? 'text-amber-bright':
                log.event_type === 'followed'       ? 'text-amber-mid'   :
                log.event_type === 'name_changed'   ? 'text-amber-text'  :
                log.event_type === 'duplicated'     ? 'text-amber-mid'   :
                'text-amber-dim'
              }`}>
                {EVENT_LABELS[log.event_type] || log.event_type?.toUpperCase() || '—'}
              </span>

              {/* Detail */}
              <span className="col-span-4 text-amber-muted truncate">
                {log.actor && log.actor !== sessionStorage.getItem('user')
                  ? <span className="text-amber-mid">@{log.actor} </span>
                  : null
                }
                {log.detail || '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!isLoading && logs.length > 0 && (
        <div className="px-4 py-3 border-t border-amber-hover text-amber-dim text-xs tracking-widest">
          {logs.length} EVENTS LOGGED · NEWEST FIRST
        </div>
      )}

    </div>
  );
}
