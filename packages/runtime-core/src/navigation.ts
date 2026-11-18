export interface RuntimeLocation {
  pathname: string;
  search: string;
}

export interface RuntimeNavigationAdapter {
  getLocation(): RuntimeLocation;
  push(path: string): void;
  replace(path: string): void;
  subscribe(listener: (location: RuntimeLocation) => void): () => void;
}

export interface RuntimePageLike {
  id: string;
  route: string;
  settings?: Record<string, unknown> | undefined;
}

export interface ResolvedRuntimeRoute {
  page: RuntimePageLike;
  params: Record<string, string>;
  query: Record<string, string>;
  pathname: string;
  notFound: boolean;
}

function normalizePathname(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }
  return value.length === 0 ? '/' : value;
}

export function parseRuntimeLocation(path: string): RuntimeLocation {
  const url = new URL(path, 'http://runtime.local');
  return { pathname: normalizePathname(url.pathname), search: url.search };
}

function isNotFoundPage(page: RuntimePageLike): boolean {
  return page.settings?.role === 'notFound' || page.route === '/404';
}

function isLandingPage(page: RuntimePageLike): boolean {
  return page.settings?.role === 'landing' || page.settings?.default === true;
}

export function buildRuntimePath(
  page: RuntimePageLike,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): string {
  const path = page.route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? '' : encodeURIComponent(value);
  });
  const search = new URLSearchParams(query).toString();
  return `${normalizePathname(path)}${search.length === 0 ? '' : `?${search}`}`;
}

export function resolveRuntimeRoute(
  pages: readonly RuntimePageLike[],
  location: RuntimeLocation
): ResolvedRuntimeRoute | undefined {
  if (pages.length === 0) {
    return undefined;
  }
  const query = Object.fromEntries(new URLSearchParams(location.search).entries());
  const pathname = normalizePathname(location.pathname);
  const segments = pathname.split('/').filter((segment) => segment.length > 0);

  for (const page of pages) {
    if (normalizePathname(page.route) === pathname) {
      return { page, params: {}, query, pathname, notFound: isNotFoundPage(page) };
    }
  }

  for (const page of pages) {
    const routeSegments = page.route.split('/').filter((segment) => segment.length > 0);
    if (routeSegments.length !== segments.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index];
      const pathSegment = segments[index];
      if (routeSegment === undefined || pathSegment === undefined) {
        matched = false;
        break;
      }
      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
        continue;
      }
      if (routeSegment !== pathSegment) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { page, params, query, pathname, notFound: isNotFoundPage(page) };
    }
  }

  const notFound = pages.find(isNotFoundPage);
  if (notFound !== undefined) {
    return { page: notFound, params: {}, query, pathname, notFound: true };
  }
  const landing = pages.find(isLandingPage) ?? pages[0];
  return landing === undefined
    ? undefined
    : { page: landing, params: {}, query, pathname, notFound: true };
}

export class MemoryNavigationAdapter implements RuntimeNavigationAdapter {
  private location: RuntimeLocation;
  private readonly listeners = new Set<(location: RuntimeLocation) => void>();

  constructor(path = '/') {
    this.location = parseRuntimeLocation(path);
  }

  getLocation(): RuntimeLocation {
    return { ...this.location };
  }

  push(path: string): void {
    this.setLocation(parseRuntimeLocation(path));
  }

  replace(path: string): void {
    this.setLocation(parseRuntimeLocation(path));
  }

  subscribe(listener: (location: RuntimeLocation) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setLocation(location: RuntimeLocation): void {
    this.location = location;
    for (const listener of this.listeners) {
      listener(this.getLocation());
    }
  }
}

interface BrowserWindowLike {
  location: { pathname: string; search: string };
  history: {
    pushState(data: unknown, unused: string, url?: string | null): void;
    replaceState(data: unknown, unused: string, url?: string | null): void;
  };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

function browserWindow(): BrowserWindowLike | undefined {
  return (globalThis as unknown as { window?: BrowserWindowLike }).window;
}

export class BrowserNavigationAdapter implements RuntimeNavigationAdapter {
  constructor(private readonly basePath = '') {}

  getLocation(): RuntimeLocation {
    const target = browserWindow();
    if (target === undefined) {
      return { pathname: '/', search: '' };
    }
    return parseRuntimeLocation(
      `${this.basePath}${target.location.pathname}${target.location.search}`
    );
  }

  push(path: string): void {
    browserWindow()?.history.pushState({}, '', `${this.basePath}${path}`);
  }

  replace(path: string): void {
    browserWindow()?.history.replaceState({}, '', `${this.basePath}${path}`);
  }

  subscribe(listener: (location: RuntimeLocation) => void): () => void {
    const target = browserWindow();
    if (target === undefined) {
      return () => undefined;
    }
    const handler = () => listener(this.getLocation());
    target.addEventListener('popstate', handler);
    return () => {
      target.removeEventListener('popstate', handler);
    };
  }
}
