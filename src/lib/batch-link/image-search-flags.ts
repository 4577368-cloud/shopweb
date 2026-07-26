/**
 * Representative multi-variant image search sends explicit `searchImageUrl`
 * values for the backend to download. Those downloads proved unreliable
 * (IMAGE_UNREADABLE on Shopify CDN images), so the feature is off and image
 * search runs the original path where the backend picks the image itself.
 *
 * Flip to true only after the backend is confirmed to fetch shop image URLs.
 */
export const MULTI_IMAGE_SEARCH_ENABLED = false;
