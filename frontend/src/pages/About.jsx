const LINES = [
  'ABOUT.TXT',
  '────────────────────────────────',
  'A sophisticated music community blog',
  'for serious collectors and listeners.',
  '',
  'BUILT WITH',
  '> React + Vite + Tailwind',
  '> Node.js + Express',
  '> SQLite',
  '> Discogs API',
  '> YouTube Data API',
  '',
  'EST. 2024',
];

export default function About() {
  return (
    <div style={{ padding: '20px 24px', fontFamily: 'VT323, monospace' }}>
      {LINES.map((line, i) => (
        <div key={i} style={{
          fontSize: '14px',
          lineHeight: '1.8',
          color: line.startsWith('─') ? 'var(--grey-light)' :
                 line.startsWith('>') ? 'var(--grey-text)'  :
                 line === ''          ? undefined           :
                 'var(--charcoal)',
          height: line === '' ? '8px' : undefined,
        }}>
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  );
}