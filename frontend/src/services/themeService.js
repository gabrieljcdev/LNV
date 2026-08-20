// ── LNV Theme Service ──────────────────────────────────────────────────────────
// 8 palettes cycling through 24 hours, 3 hours each.
// Contrast accent on showcase cards during daylight (06:00–21:00).
// Tonal only during night (21:00–06:00).

export const PALETTES = [
  { name:'Deep Night',   slot:'00:00', isDark:true,  bg:'#08090B', sidebar:'#08090B', dark1:'#08090B', dark2:'#17191D', dark3:'#2B2F36', light1:'#6B7380', light2:'#F2F4F7', showcase:'#2B2F36', accent:'#6B7380' },
  { name:'Pre-dawn',     slot:'03:00', isDark:true,  bg:'#0A0D14', sidebar:'#0C0F18', dark1:'#0A0D14', dark2:'#141C2A', dark3:'#1A2230', light1:'#1E2535', light2:'#1E2535', showcase:'#1E2535', accent:'#404C70' },
  { name:'First Light',  slot:'06:00', isDark:false, bg:'#DCE8F0', sidebar:'#EDF4F8', dark1:'#12304A', dark2:'#1E4060', dark3:'#BACED8', light1:'#EAF2F8', light2:'#EDF4F8', showcase:'#1A4A6B', accent:'#1A4A6B' },
  { name:'Morning',      slot:'09:00', isDark:false, bg:'#E4E0D6', sidebar:'#F0EDE4', dark1:'#1C2E1E', dark2:'#2C4A2E', dark3:'#B8C4B0', light1:'#EAE6DC', light2:'#F0EDE4', showcase:'#2C4A2E', accent:'#2C4A2E' },
  { name:'Midday',       slot:'12:00', isDark:false, bg:'#FFEA61', sidebar:'#FFEA61', dark1:'#8B1A1A', dark2:'#C0392B', dark3:'#E05020', light1:'#FF8C00', light2:'#FFC300', showcase:'#8B1A1A', accent:'#8B1A1A' },
  { name:'Afternoon',    slot:'15:00', isDark:false, bg:'#E8E2D8', sidebar:'#F5F0E8', dark1:'#1A1612', dark2:'#2E2820', dark3:'#D4CEC4', light1:'#EDE8DF', light2:'#F5F0E8', showcase:'#C4391A', accent:'#C4391A' },
  { name:'Evening',      slot:'18:00', isDark:true,  bg:'#2A1A4E', sidebar:'#3C2967', dark1:'#2A1A4E', dark2:'#C3005D', dark3:'#FD9367', light1:'#FDCD63', light2:'#FDCD63', showcase:'#782D65', accent:'#C3005D' },
  { name:'Late Evening', slot:'21:00', isDark:true,  bg:'#1B1928', sidebar:'#1B1928', dark1:'#1B1928', dark2:'#1C3182', dark3:'#2D3956', light1:'#404C70', light2:'#9970AA', showcase:'#404C70', accent:'#9970AA' },
];

export function getAutoIndex() {
  const h = new Date().getHours();
  if (h < 3)  return 0;
  if (h < 6)  return 1;
  if (h < 9)  return 2;
  if (h < 12) return 3;
  if (h < 15) return 4;
  if (h < 18) return 5;
  if (h < 21) return 6;
  return 7;
}

export function applyPalette(idx) {
  const p = PALETTES[idx];
  const r = document.documentElement.style;
  r.setProperty('--theme-bg',       p.bg);
  r.setProperty('--theme-sidebar',  p.sidebar);
  r.setProperty('--theme-dark1',    p.dark1);
  r.setProperty('--theme-dark2',    p.dark2);
  r.setProperty('--theme-dark3',    p.dark3);
  r.setProperty('--theme-light1',   p.light1);
  r.setProperty('--theme-light2',   p.light2);
  r.setProperty('--theme-showcase', p.showcase);
  r.setProperty('--theme-accent',   p.accent);
  if (p.isDark) {
    r.setProperty('--theme-text-pri', 'rgba(255,255,255,0.65)');
    r.setProperty('--theme-text-sec', 'rgba(255,255,255,0.35)');
    r.setProperty('--theme-text-ter', 'rgba(255,255,255,0.18)');
    r.setProperty('--theme-border',   'rgba(255,255,255,0.06)');
  } else {
    r.setProperty('--theme-text-pri', 'rgba(0,0,0,0.72)');
    r.setProperty('--theme-text-sec', 'rgba(0,0,0,0.45)');
    r.setProperty('--theme-text-ter', 'rgba(0,0,0,0.28)');
    r.setProperty('--theme-border',   'rgba(0,0,0,0.09)');
  }
}
