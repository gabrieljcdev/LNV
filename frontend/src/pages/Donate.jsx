const LINES = [
  'DONATE.TXT',
  '────────────────────────────────',
  'Late Night Vibes is free and always will be.',
  'If you enjoy it, consider supporting the project.',
  '',
  'BITCOIN',
  '> YOUR_BTC_ADDRESS_HERE',
  '',
  'THANK YOU FOR DIGGING WITH US.',
];

export default function Donate() {
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