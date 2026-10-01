// Tamanho do texto (Configurações > Aparência), separado do zoom: toda classe `text-*`
// de tamanho (text-sm, text-[13px]…) sai multiplicada por var(--text-scale), que o app
// põe no <html> (ver src/lib/textScale.js). Substitui o plugin fontSize do Tailwind
// pelo mesmo contrato dele. Só px/rem escalam: em/% já são relativos ao pai escalado.
const scaleLen = (v) =>
  typeof v === 'string' && /^-?[\d.]+(px|rem)$/.test(v.trim())
    ? `calc(${v} * var(--text-scale, 1))`
    : v;
function scaledFontSize({ matchUtilities, theme }) {
  matchUtilities(
    {
      text: (value, { modifier }) => {
        const [size, options] = Array.isArray(value) ? value : [value];
        if (modifier) return { 'font-size': scaleLen(size), 'line-height': scaleLen(modifier) };
        const opts = options && typeof options === 'object' ? options : { lineHeight: options };
        return {
          'font-size': scaleLen(size),
          ...(opts.lineHeight === undefined ? {} : { 'line-height': scaleLen(opts.lineHeight) }),
          ...(opts.letterSpacing === undefined ? {} : { 'letter-spacing': opts.letterSpacing }),
          ...(opts.fontWeight === undefined ? {} : { 'font-weight': opts.fontWeight }),
        };
      },
    },
    {
      values: theme('fontSize'),
      modifiers: theme('lineHeight'),
      type: ['absolute-size', 'relative-size', 'length', 'percentage'],
    },
  );
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  corePlugins: { fontSize: false },
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), scaledFontSize],
};
