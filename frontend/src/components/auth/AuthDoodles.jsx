import React from 'react';

/**
 * Decorative background for the sign-in / sign-up screens.
 *
 * Stroke-only pen sketches — no fills, no gradients — so they read like
 * technical line drawings on a sheet of white paper rather than solid stickers.
 * Elements inside a `doodle-detail` group are drawn with a lighter hairline,
 * which is what gives the shapes their engraved, non-cartoonish look.
 *
 * Placement, size and rotation live in Auth.css so the set can be thinned out
 * on smaller screens.
 */

const DOODLES = [
  {
    id: 'bank',
    shape: (
      <>
        {/* pediment + entablature */}
        <path d="M5 32 L48 8 L91 32" />
        <path d="M8 32 H88 M8 38 H88 M8 32 V38 M88 32 V38" />
        {/* colonnade */}
        <path d="M17 42 V70 M22 42 V70 M32 42 V70 M37 42 V70 M47 42 V70 M52 42 V70 M62 42 V70 M67 42 V70 M77 42 V70 M82 42 V70" />
        <rect x="15" y="38" width="9" height="4" />
        <rect x="30" y="38" width="9" height="4" />
        <rect x="45" y="38" width="9" height="4" />
        <rect x="60" y="38" width="9" height="4" />
        <rect x="75" y="38" width="9" height="4" />
        <rect x="15" y="70" width="9" height="4" />
        <rect x="30" y="70" width="9" height="4" />
        <rect x="45" y="70" width="9" height="4" />
        <rect x="60" y="70" width="9" height="4" />
        <rect x="75" y="70" width="9" height="4" />
        {/* stylobate + steps */}
        <path d="M8 74 H88 M8 79 H88 M8 74 V79 M88 74 V79" />
        <path d="M5 84 H91 M2 89 H94" />
        <g className="doodle-detail">
          <path d="M12 29 L48 13 L84 29" />
          <path d="M10 35 H86" />
          <circle cx="48" cy="22" r="3.4" />
          <path d="M48 22 V19.4 M48 22 L50 23.2" />
          <path d="M19.5 44 V68 M34.5 44 V68 M49.5 44 V68 M64.5 44 V68 M79.5 44 V68" />
        </g>
      </>
    ),
  },
  {
    id: 'note',
    shape: (
      <>
        <rect x="4" y="22" width="88" height="52" rx="2" />
        <ellipse cx="48" cy="48" rx="14" ry="16" />
        <circle cx="20" cy="35" r="4" />
        <circle cx="76" cy="35" r="4" />
        <circle cx="20" cy="61" r="4" />
        <circle cx="76" cy="61" r="4" />
        <g className="doodle-detail">
          <rect x="9" y="27" width="78" height="42" rx="1" />
          <rect x="12" y="30" width="72" height="36" />
          <ellipse cx="48" cy="48" rx="11" ry="13" />
          <circle cx="48" cy="43" r="4.5" />
          <path d="M41 58 q7 -8 14 0" />
          <circle cx="20" cy="35" r="1.8" />
          <circle cx="76" cy="35" r="1.8" />
          <circle cx="20" cy="61" r="1.8" />
          <circle cx="76" cy="61" r="1.8" />
          <path d="M16 44 H30 M16 48 H30 M16 52 H30 M66 44 H80 M66 48 H80 M66 52 H80" />
          <path d="M28 70 q5 -4 9 -1 t8 -1" />
        </g>
      </>
    ),
  },
  {
    id: 'coins',
    shape: (
      <>
        <ellipse cx="48" cy="28" rx="26" ry="8" />
        <path d="M22 28 V42 M74 28 V42" />
        <path d="M22 42 A26 8 0 0 0 74 42" />
        <path d="M22 42 V56 M74 42 V56" />
        <path d="M22 56 A26 8 0 0 0 74 56" />
        <path d="M22 56 V70 M74 56 V70" />
        <path d="M22 70 A26 8 0 0 0 74 70" />
        <g className="doodle-detail">
          <ellipse cx="48" cy="28" rx="19" ry="5.5" />
          <path d="M22 39 A26 8 0 0 0 74 39" />
          <path d="M22 53 A26 8 0 0 0 74 53" />
          <path d="M22 67 A26 8 0 0 0 74 67" />
          {/* milled edge on the middle coin — the tick tops follow the arc */}
          <path d="M30 47.8 V61.8 M37 49.2 V63.2 M44 49.9 V63.9 M51 49.9 V63.9 M58 49.4 V63.4 M65 48.1 V62.1" />
        </g>
      </>
    ),
  },
  {
    id: 'ledger',
    shape: (
      <>
        <path d="M24 8 H64 L76 20 V88 H24 Z" />
        <path d="M64 8 V20 H76" />
        <rect x="46" y="63" width="22" height="11" />
        <g className="doodle-detail">
          <path d="M32 24 H56" />
          <path d="M32 30 H48" />
          <path d="M32 38 H68" />
          <path d="M32 45 H68 M32 52 H68 M32 59 H68" />
          <path d="M58 38 V59" />
          <path d="M32 68 H42" />
          <path d="M32 81 q6 -5 11 -1 t9 -2" />
        </g>
      </>
    ),
  },
  {
    id: 'vault',
    shape: (
      <>
        <rect x="8" y="12" width="80" height="68" rx="4" />
        <rect x="15" y="19" width="66" height="54" rx="3" />
        <circle cx="45" cy="46" r="13" />
        <path d="M45 46 V31 M45 46 V61 M45 46 H30 M45 46 H60" />
        <path d="M16 80 V86 M80 80 V86" />
        <g className="doodle-detail">
          <rect x="19" y="23" width="58" height="46" rx="2" />
          <circle cx="45" cy="46" r="9" />
          <circle cx="45" cy="46" r="2.4" />
          <circle cx="45" cy="31" r="2" />
          <circle cx="45" cy="61" r="2" />
          <circle cx="30" cy="46" r="2" />
          <circle cx="60" cy="46" r="2" />
          <rect x="9" y="27" width="6" height="9" />
          <rect x="9" y="57" width="6" height="9" />
          <path d="M81 46 H86" />
          <circle cx="86.5" cy="46" r="1.8" />
          <rect x="63" y="27" width="12" height="9" />
        </g>
      </>
    ),
  },
];

const AuthDoodles = () => (
  <div className="auth-doodles" aria-hidden="true">
    {DOODLES.map(({ id, shape }) => (
      <svg key={id} className={`auth-doodle auth-doodle--${id}`} viewBox="0 0 96 96">
        {shape}
      </svg>
    ))}
  </div>
);

export default AuthDoodles;
