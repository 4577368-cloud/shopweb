/** Shared Window.shopify typing for App Bridge 4 CDN global. */

export {};

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      toast?: {
        show: (
          message: string,
          options?: { duration?: number; isError?: boolean }
        ) => void;
      };
    };
  }
}
