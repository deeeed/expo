import { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import {
  parsePathAndParamsFromExpoGoLink,
  parsePathFromExpoGoLink,
} from '../fork/extractPathFromURL';
import { getPathFromState } from '../fork/getPathFromState';
import { getStateFromPath } from '../fork/getStateFromPath';
import { getInitialURLWithTimeout } from '../fork/useLinking';
import { applyRedirects } from '../getRoutesRedirects';
import { StoreRedirects } from '../global-state/router-store';
import { NativeIntent } from '../types';

const isExpoGo = typeof expo !== 'undefined' && globalThis.expo?.modules?.ExpoGo;

// A custom getInitialURL is used on native to ensure the app always starts at
// the root path if it's launched from something other than a deep link.
// This helps keep the native functionality working like the web functionality.
// For example, if you had a root navigator where the first screen was `/settings` and the second was `/index`
// then `/index` would be used on web and `/settings` would be used on native.
export function getInitialURL(): ReturnType<
  NonNullable<LinkingOptions<Record<string, unknown>>['getInitialURL']>
> {
  if (typeof window === 'undefined') {
    return '';
  }
  if (Platform.OS === 'web' && window.location?.href) {
    return window.location.href;
  }
  if (Platform.OS === 'ios') {
    // Use the new Expo API for iOS. This has better support for App Clips and handoff.
    const url = Linking.getLinkingURL();
    return (
      parseExpoGoUrlFromListener(url) ??
      // The path will be nullish in bare apps when the app is launched from the home screen.
      // TODO(EvanBacon): define some policy around notifications.
      getRootURL()
    );
  }

  // TODO: Figure out if expo-linking on Android has full interop with the React Native implementation.
  return Promise.resolve(getInitialURLWithTimeout()).then(
    (url) =>
      parseExpoGoUrlFromListener(url) ??
      // The path will be nullish in bare apps when the app is launched from the home screen.
      // TODO(EvanBacon): define some policy around notifications.
      getRootURL()
  );
}

let _rootURL: string | undefined;

export function getRootURL(): string {
  if (_rootURL === undefined) {
    _rootURL = Linking.createURL('/');
    if (isExpoGo) {
      _rootURL = parsePathFromExpoGoLink(_rootURL);
    }
  }
  return _rootURL;
}

// Expo Go is weird and requires the root path to be `/--/`
function parseExpoGoUrlFromListener<T extends string | null>(url: T): T {
  if (!url || !isExpoGo) {
    return url;
  }
  const { pathname, queryString } = parsePathAndParamsFromExpoGoLink(url);
  // If the URL is defined (default in Expo Go dev apps) and the URL has no path:
  // `exp://192.168.87.39:19000/` then use the default `exp://192.168.87.39:19000/--/`
  if (!pathname || pathname === '/') {
    return (getRootURL() + queryString) as T;
  }
  return url;
}

export function subscribe(
  nativeLinking: NativeIntent | undefined,
  redirects: StoreRedirects[] | undefined
) {
  return (listener: (url: string) => void) => {
    let callback: (({ url }: { url: string }) => void) | undefined;

    const legacySubscription = nativeLinking?.legacy_subscribe?.(listener);

    if (isExpoGo) {
      // This extra work is only done in the Expo Go app.
      callback = async ({ url }) => {
        let href: string | undefined | null = parseExpoGoUrlFromListener(url);
        href = applyRedirects(href, redirects);
        if (href && nativeLinking?.redirectSystemPath) {
          href = await nativeLinking.redirectSystemPath({ path: href, initial: false });
        }

        if (href) {
          listener(href);
        }
      };
    } else {
      callback = async ({ url }) => {
        let href = applyRedirects(url, redirects);
        if (href && nativeLinking?.redirectSystemPath) {
          href = await nativeLinking.redirectSystemPath({ path: href, initial: false });
        }

        if (href) {
          listener(href);
        }
      };
    }

    const subscription = Linking.addEventListener('url', callback);

    return () => {
      // https://github.com/facebook/react-native/commit/6d1aca806cee86ad76de771ed3a1cc62982ebcd7
      subscription?.remove?.();
      legacySubscription?.();
    };
  };
}

export { getStateFromPath, getPathFromState };
