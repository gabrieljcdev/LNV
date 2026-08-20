import { useState, useRef } from 'react';

export default function HoverCard({ children, content }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timerRef = useRef(null);

  function handleMouseEnter(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
    });
    timerRef.current = setTimeout(() => setVisible(true), 350);
  }

  function handleMouseLeave() {
    clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && content && (
        <div
          className="fixed z-50 bg-amber-dark border border-amber-dim px-3 py-2 text-sm min-w-48 max-w-64 font-terminal"
          style={{ top: position.top, left: position.left }}
        >
          {content}
        </div>
      )}
    </span>
  );
}