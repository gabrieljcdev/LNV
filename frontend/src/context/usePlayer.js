import { createContext, useContext } from 'react';

// The player's shared state (PlayerProvider in PlayerContext.jsx). Kept in
// its own file: a .jsx file that exports anything but components breaks
// Fast Refresh.
export const PlayerContext = createContext(null);

export function usePlayer() {
  return useContext(PlayerContext);
}
