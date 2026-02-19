/**
 * POS Integration OAuth Handlers
 * Backend code for handling OAuth flows and API authentication for all 5 POS systems
 */

const axios = require('axios');
const crypto = require('crypto');

// ============================================================================
// SQUARE INTEGRATION
// ============================================================================

class SquareIntegration {
  constructor(config) {
    this.applicationId = config.applicationId;
    this.applicationSecret = config.applicationSecret;
    this.environment = config.environment || 'sandbox';
    this.redirectUri = config.redirectUri;
    
    this.baseUrl = this.environment === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state, scopes = [
    'MERCHANT_PROFILE_READ',
    'PAYMENTS_READ',
    'PAYMENTS_WRITE',
    'ORDERS_READ',
    'ORDERS_WRITE',
    'ITEMS_READ',
    'ITEMS_WRITE',
    'INVENTORY_READ',
    'INVENTORY_WRITE'
  ]) {
    const params = new URLSearchParams({
      client_id: this.applicationId,
      scope: scopes.join(' '),
      session: 'false',
      state: state
    });
    
    return `${this.baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth2/token`, {
        client_id: this.applicationId,
        client_secret: this.applicationSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Square-Version': '2024-12-18'
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: response.data.expires_at,
        merchantId: response.data.merchant_id,
        tokenType: response.data.token_type
      };
    } catch (error) {
      throw new Error(`Square token exchange failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Refresh expired access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth2/token`, {
        client_id: this.applicationId,
        client_secret: this.applicationSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Square-Version': '2024-12-18'
        }
      });

      return {
        accessToken: response.data.access_token,
        expiresAt: response.data.expires_at,
        merchantId: response.data.merchant_id
      };
    } catch (error) {
      throw new Error(`Square token refresh failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Make authenticated API call
   */
  async makeApiCall(endpoint, accessToken, method = 'GET', data = null) {
    const apiBaseUrl = this.environment === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    try {
      const response = await axios({
        method,
        url: `${apiBaseUrl}/v2/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Square-Version': '2024-12-18'
        },
        data
      });

      return response.data;
    } catch (error) {
      throw new Error(`Square API call failed: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }
}

// ============================================================================
// TOAST INTEGRATION
// ============================================================================

class ToastIntegration {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.restaurantGuid = config.restaurantGuid;
    this.userAccessType = config.userAccessType || 'TOAST_MACHINE_CLIENT';
    this.environment = config.environment || 'sandbox';
    
    this.hostname = this.environment === 'sandbox'
      ? 'toast-api-server' // Provided by Toast team
      : 'toast-api-server'; // Provided by Toast team
  }

  /**
   * Authenticate and get access token
   * Toast uses direct authentication, not OAuth redirect flow
   */
  async authenticate() {
    try {
      const response = await axios.post(
        `https://${this.hostname}/authentication/v1/authentication/login`,
        {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          userAccessType: this.userAccessType
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        accessToken: response.data.token.accessToken,
        expiresIn: response.data.token.expiresIn,
        tokenType: 'Bearer'
      };
    } catch (error) {
      throw new Error(`Toast authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Refresh authentication token before expiry
   */
  async refreshToken() {
    // Toast requires re-authentication
    return this.authenticate();
  }

  /**
   * Make authenticated API call
   */
  async makeApiCall(endpoint, accessToken, method = 'GET', data = null) {
    try {
      const response = await axios({
        method,
        url: `https://${this.hostname}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Toast-Restaurant-External-ID': this.restaurantGuid,
          'Content-Type': 'application/json'
        },
        data
      });

      return response.data;
    } catch (error) {
      throw new Error(`Toast API call failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// ============================================================================
// SHOPIFY INTEGRATION
// ============================================================================

class ShopifyIntegration {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.shopDomain = config.shopDomain;
    this.redirectUri = config.redirectUri;
    this.accessToken = config.accessToken; // For custom apps
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state, scopes = [
    'read_products',
    'write_products',
    'read_orders',
    'write_orders',
    'read_inventory',
    'write_inventory',
    'read_customers',
    'write_customers'
  ]) {
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: scopes.join(','),
      redirect_uri: this.redirectUri,
      state: state
    });

    return `https://${this.shopDomain}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(
        `https://${this.shopDomain}/admin/oauth/access_token`,
        {
          client_id: this.apiKey,
          client_secret: this.apiSecret,
          code: code
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        scope: response.data.scope
      };
    } catch (error) {
      throw new Error(`Shopify token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(data, hmacHeader) {
    const hash = crypto
      .createHmac('sha256', this.apiSecret)
      .update(data, 'utf8')
      .digest('base64');
    
    return hash === hmacHeader;
  }

  /**
   * Make authenticated API call (REST)
   */
  async makeApiCall(endpoint, accessToken, method = 'GET', data = null) {
    const token = accessToken || this.accessToken;
    
    if (!token) {
      throw new Error('Access token required');
    }

    try {
      const response = await axios({
        method,
        url: `https://${this.shopDomain}/admin/api/2024-10/${endpoint}`,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        data
      });

      return response.data;
    } catch (error) {
      throw new Error(`Shopify API call failed: ${error.response?.data?.errors || error.message}`);
    }
  }

  /**
   * Make GraphQL API call
   */
  async makeGraphQLCall(query, accessToken, variables = {}) {
    const token = accessToken || this.accessToken;
    
    if (!token) {
      throw new Error('Access token required');
    }

    try {
      const response = await axios.post(
        `https://${this.shopDomain}/admin/api/2024-10/graphql.json`,
        {
          query,
          variables
        },
        {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.errors) {
        throw new Error(JSON.stringify(response.data.errors));
      }

      return response.data.data;
    } catch (error) {
      throw new Error(`Shopify GraphQL call failed: ${error.message}`);
    }
  }
}

// ============================================================================
// CLOVER INTEGRATION
// ============================================================================

class CloverIntegration {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.merchantId = config.merchantId;
    this.environment = config.environment || 'sandbox';
    this.region = config.region || 'us';
    this.redirectUri = config.redirectUri;
    
    this.authBaseUrl = this.environment === 'sandbox'
      ? 'https://sandbox.dev.clover.com'
      : 'https://www.clover.com';
      
    this.apiBaseUrl = this.environment === 'sandbox'
      ? 'https://apisandbox.dev.clover.com'
      : this.getProductionApiUrl();
  }

  getProductionApiUrl() {
    const regionUrls = {
      us: 'https://api.clover.com',
      ca: 'https://api.clover.com',
      eu: 'https://api.eu.clover.com'
    };
    return regionUrls[this.region] || regionUrls.us;
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state: state
    });

    return `${this.authBaseUrl}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const params = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        code: code
      });

      const response = await axios.get(
        `${this.authBaseUrl}/oauth/token?${params.toString()}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        // Clover tokens don't expire in production
      };
    } catch (error) {
      throw new Error(`Clover token exchange failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate test API token (sandbox only)
   */
  async generateTestToken(permissions = [
    'ORDERS_R',
    'ORDERS_W',
    'MERCHANT_R',
    'PAYMENTS_R',
    'INVENTORY_R'
  ]) {
    if (this.environment !== 'sandbox') {
      throw new Error('Test tokens can only be generated in sandbox environment');
    }
    
    // This would be done through the Clover Developer Dashboard UI
    console.log('Generate test token through Clover Merchant Dashboard > API Tokens');
    console.log('Required permissions:', permissions);
  }

  /**
   * Make authenticated API call
   */
  async makeApiCall(endpoint, accessToken, method = 'GET', data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.apiBaseUrl}/v3/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        data
      });

      return response.data;
    } catch (error) {
      throw new Error(`Clover API call failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// ============================================================================
// LIGHTSPEED INTEGRATION
// ============================================================================

class LightspeedIntegration {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accountId = config.accountId;
    this.productLine = config.productLine; // 'retail', 'restaurant', or 'xseries'
    this.environment = config.environment || 'sandbox';
    this.redirectUri = config.redirectUri;
    
    this.setUrls();
  }

  setUrls() {
    if (this.productLine === 'retail') {
      // R-Series
      this.authBaseUrl = 'https://cloud.lightspeedapp.com/oauth';
      this.apiBaseUrl = 'https://api.lightspeedapp.com/API';
    } else if (this.productLine === 'restaurant') {
      // K-Series
      this.authBaseUrl = this.environment === 'sandbox'
        ? 'https://api.trial.lsk.lightspeed.app/oauth'
        : 'https://api.lsk.lightspeed.app/oauth';
      this.apiBaseUrl = this.authBaseUrl.replace('/oauth', '');
    } else if (this.productLine === 'xseries') {
      // X-Series
      this.authBaseUrl = 'https://cloud.retail.lightspeed.app/oauth';
      this.apiBaseUrl = 'https://api.retail.lightspeed.app/api/1.0';
    }
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state) {
    let scopes = [];
    
    if (this.productLine === 'retail') {
      scopes = ['employee:all', 'inventory:all', 'sales:all', 'customers:all'];
    } else if (this.productLine === 'restaurant') {
      scopes = ['financial-api', 'orders-api'];
    } else if (this.productLine === 'xseries') {
      scopes = ['sales', 'inventory', 'customers', 'products'];
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes.join(' '),
      redirect_uri: this.redirectUri,
      state: state
    });

    const authEndpoint = this.productLine === 'retail' ? 'authorize.php' : 'authorize';
    return `${this.authBaseUrl}/${authEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      let tokenEndpoint = this.productLine === 'retail' 
        ? 'access_token.php' 
        : 'token';

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri
      });

      const url = this.productLine === 'retail'
        ? `${this.authBaseUrl}/${tokenEndpoint}?${params.toString()}`
        : `${this.authBaseUrl}/${tokenEndpoint}`;

      const response = await axios.post(
        url,
        this.productLine === 'retail' ? null : params.toString(),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': this.productLine === 'retail' 
              ? 'application/json'
              : 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      throw new Error(`Lightspeed token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh expired access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const tokenEndpoint = this.productLine === 'retail' 
        ? 'access_token.php' 
        : 'token';

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await axios.post(
        `${this.authBaseUrl}/${tokenEndpoint}`,
        params.toString(),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      throw new Error(`Lightspeed token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Make authenticated API call
   */
  async makeApiCall(endpoint, accessToken, method = 'GET', data = null) {
    try {
      const url = this.productLine === 'retail'
        ? `${this.apiBaseUrl}/Account/${this.accountId}/${endpoint}`
        : `${this.apiBaseUrl}/${endpoint}`;

      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      // Retail API uses Accept header for version
      if (this.productLine === 'retail') {
        headers['Accept'] = 'application/vnd.merchantos-v3+json';
      }

      const response = await axios({
        method,
        url,
        headers,
        data
      });

      return response.data;
    } catch (error) {
      throw new Error(`Lightspeed API call failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a secure random state parameter for OAuth
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store OAuth state securely (implement with your database)
 */
async function storeOAuthState(state, data) {
  // Store in Redis or database with expiry
  console.log('Store state:', state, data);
}

/**
 * Verify OAuth state (implement with your database)
 */
async function verifyOAuthState(state) {
  // Retrieve and verify from Redis or database
  console.log('Verify state:', state);
  return true;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SquareIntegration,
  ToastIntegration,
  ShopifyIntegration,
  CloverIntegration,
  LightspeedIntegration,
  generateState,
  storeOAuthState,
  verifyOAuthState
};
