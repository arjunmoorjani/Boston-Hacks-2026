const paths = {
  route: <><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="m7 16 4-6 4 3 3-6"/></>,
  cone: <><path d="m8 13 4 8 4-8H8Z"/><path d="M8 13a4 4 0 1 1 8 0"/></>,
  waves: <><path d="M2 8c3 0 3-3 5-3s3 3 5 3 3-3 5-3 2 3 5 3M2 13c3 0 3-3 5-3s3 3 5 3 3-3 5-3 2 3 5 3M2 18c3 0 3-3 5-3s3 3 5 3 3-3 5-3 2 3 5 3"/></>,
  arrow: <path d="M3 12h17m-6-6 6 6-6 6"/>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"/>,
  arrowLeft: <path d="M21 12H4m6-6-6 6 6 6"/>,
  external: <path d="M6 18 18 6M8 6h10v10"/>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  plus: <path d="M5 12h14m-7-7v14"/>,
  minus: <path d="M5 12h14"/>,
  fit: <path d="M8 4H4v4m12-4h4v4m0 8v4h-4m-12-4v4h4"/>,
  locate: <><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  chevronUp: <path d="m6 15 6-6 6 6"/>,
  train: <><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9.5" cy="14" r=".6"/><circle cx="14.5" cy="14" r=".6"/></>,
};

export function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
