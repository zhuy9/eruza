/** Display-only settings. Logos stay on this server and inside the ignored branding folder. */
export function readBranding(env: { VITE_BRAND_NAME?: string; VITE_BRAND_LOGO?: string }) {
  const logo = env.VITE_BRAND_LOGO?.trim() ?? '';
  return {
    name: env.VITE_BRAND_NAME?.trim() || null,
    logo: /^\/branding\/[a-z0-9_-]+\.(svg|png|webp|jpe?g|gif|ico)$/i.test(logo) ? logo : null,
  };
}

export const branding = readBranding({
  VITE_BRAND_NAME: import.meta.env.VITE_BRAND_NAME,
  VITE_BRAND_LOGO: import.meta.env.VITE_BRAND_LOGO,
});
