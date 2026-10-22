// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Brand } from '../src/components/brand';
import { readBranding } from '../src/lib/branding';

describe('local branding settings', () => {
  it('keeps the defaults for blank settings and trims custom values independently', () => {
    expect(readBranding({})).toEqual({ name: null, logo: null });
    expect(readBranding({ VITE_BRAND_NAME: '  ', VITE_BRAND_LOGO: '' })).toEqual({
      name: null,
      logo: null,
    });
    expect(readBranding({ VITE_BRAND_NAME: ' Sample workspace ' })).toEqual({
      name: 'Sample workspace',
      logo: null,
    });
    expect(readBranding({ VITE_BRAND_LOGO: ' /branding/logo.svg ' })).toEqual({
      name: null,
      logo: '/branding/logo.svg',
    });
  });

  it('accepts local images but refuses remote URLs, traversal, and non-image files', () => {
    for (const extension of ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'ico']) {
      const logo = `/branding/sample-logo.${extension}`;
      expect(readBranding({ VITE_BRAND_LOGO: logo }).logo).toBe(logo);
    }
    for (const logo of [
      'https://example.invalid/logo.svg',
      '//example.invalid/logo.svg',
      'data:image/svg+xml,<svg/>',
      '/api/avatars/person-a',
      '/branding/../logo.svg',
      '/branding/%2e%2e/logo.svg',
      '/branding/logo.svg?redirect=https://example.invalid',
      '/branding/logo.html',
    ]) {
      expect(readBranding({ VITE_BRAND_LOGO: logo }).logo).toBeNull();
    }
  });
});

describe('sidebar and tab branding', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    document.head.innerHTML =
      '<title>Eruza</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">';
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  it('keeps the original mark, name, and favicon when nothing is configured', async () => {
    await act(() => root.render(createElement(Brand, { name: null, logo: null })));
    expect(container.querySelector('.brand-name')?.textContent).toBe('eruza.');
    expect(container.querySelector('.brand-mark')?.textContent).toBe('e');
    expect(document.title).toBe('Eruza');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('renders a custom name as text and uses the custom image for the mark and favicon', async () => {
    const name = '<img src=x onerror=alert(1)> Sample';
    await act(() => root.render(createElement(Brand, { name, logo: '/branding/logo.png' })));
    expect(container.querySelector('.brand-name')?.textContent).toBe(name);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/branding/logo.png');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(document.title).toBe(name);
    const icon = document.querySelector('link[rel="icon"]')!;
    expect(icon.getAttribute('href')).toBe('/branding/logo.png');
    expect(icon.hasAttribute('type')).toBe(false);
  });

  it('restores the default mark and favicon if the logo fails, keeping the custom name', async () => {
    await act(() =>
      root.render(createElement(Brand, { name: 'Sample', logo: '/branding/missing.svg' })),
    );
    await act(() => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.brand-mark')?.textContent).toBe('e');
    expect(container.querySelector('.brand-name')?.textContent).toBe('Sample');
    expect(document.title).toBe('Sample');
    const icon = document.querySelector('link[rel="icon"]')!;
    expect(icon.getAttribute('href')).toBe('/favicon.svg');
    expect(icon.getAttribute('type')).toBe('image/svg+xml');
  });
});
