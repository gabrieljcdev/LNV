import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = import.meta.env.VITE_API_URL;

export default function CrateComments({ crateId, postId }) {
  const queryClient = useQueryClient();
  const currentUser = sessionStorage.getItem('user');
  const [input, setInput] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['crate-comments', crateId, postId],
    queryFn: async () => {
      const res = await fetch(`${API}/crates/${crateId}/comments/${postId}`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`${API}/crates/${crateId}/comments/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, body }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crate-comments', crateId, postId] });
      setInput('');
    },
  });

  return (
    <div className="border-t border-amber-hover px-4 py-2 bg-amber-card">

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="space-y-1 mb-2">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3 text-xs tracking-wide">
              <span className="text-amber-mid flex-shrink-0">@{c.username}</span>
              <span className="text-amber-text">{c.body}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {currentUser && (
        <div className="flex items-center gap-2">
          <span className="text-amber-dim text-xs">&gt;</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && input.trim()) {
                addMutation.mutate(input.trim());
              }
            }}
            placeholder="ADD COMMENT..."
            className="flex-1 bg-transparent border-b border-amber-hover outline-none text-amber-text text-xs tracking-widest font-terminal placeholder-amber-dim caret-amber-bright py-1"
            spellCheck={false}
          />
          <button
            onClick={() => { if (input.trim()) addMutation.mutate(input.trim()); }}
            className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-0.5 transition-all"
          >
            [POST]
          </button>
        </div>
      )}

    </div>
  );
}