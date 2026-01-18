// Earth Engine Utilities for Node.js Express Server
import ee from '@google/earthengine';

let isInitialized = false;

/**
 * Authenticate with Google Earth Engine using a service account
 */
export function authenticate(serviceAccount: any): Promise<void> {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      serviceAccount,
      () =>
        ee.initialize(
          null,
          null,
          () => {
            isInitialized = true;
            console.log('[EarthEngine] Successfully authenticated and initialized');
            resolve();
          },
          (error: any) => reject(new Error(error))
        ),
      (error: any) => reject(new Error(error))
    );
  });
}

/**
 * Check if Earth Engine is initialized
 */
export function isEeInitialized(): boolean {
  return isInitialized;
}

/**
 * Evaluate an Earth Engine object (callback-based to avoid blocking)
 */
export function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((result: any, error: any) =>
      error ? reject(new Error(error)) : resolve(result)
    )
  );
}

/**
 * Get map tile URL from an Earth Engine image
 */
export function getMapId(image: any, vis: any): Promise<{ urlFormat: string; mapid: string; token: string }> {
  return new Promise((resolve, reject) => {
    image.getMapId(vis, (obj: any, error: any) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve({
          urlFormat: obj.urlFormat,
          mapid: obj.mapid,
          token: obj.token,
        });
      }
    });
  });
}

/**
 * Get map tile URL with retry logic
 */
export async function getMapIdWithRetry(
  image: any,
  vis: any,
  retries: number = 3,
  delayMs: number = 1000
): Promise<{ urlFormat: string; mapid: string; token: string }> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await getMapId(image, vis);
    } catch (error: any) {
      attempt++;
      console.warn(`[EarthEngine] getMapId attempt ${attempt} failed:`, error.message);
      if (attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('getMapIdWithRetry exhausted all retries');
}

/**
 * Build service account credentials from environment variables
 */
export function buildServiceAccount(): any {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!privateKey || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PROJECT_ID) {
    throw new Error('Missing required Google Cloud credentials in environment variables');
  }

  return {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    universe_domain: 'googleapis.com',
  };
}

/**
 * Initialize Earth Engine using environment variables
 */
export async function initializeEarthEngine(): Promise<void> {
  if (isInitialized) {
    console.log('[EarthEngine] Already initialized');
    return;
  }

  const serviceAccount = buildServiceAccount();
  await authenticate(serviceAccount);
}

export { ee };
