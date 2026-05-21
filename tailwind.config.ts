import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx,js,jsx}', './lib/**/*.{ts,tsx}'],
  corePlugins: {
    // Disable Tailwind's Preflight reset. The Springs design system lives in
    // global.css / landing.css and depends on browser-default styling that
    // Preflight would override (margins on <h*>, list bullets, image
    // sizing, etc.). With Preflight off, Tailwind utilities are still
    // available for new JSX without touching the Webflow cascade.
    preflight: false,
  },
  theme: { extend: {} },
  plugins: [],
};

export default config;
