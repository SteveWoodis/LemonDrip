/**
 * Express.js Route Handlers for POS OAuth Integration
 * 
 * This file demonstrates how to implement OAuth flows for all 5 POS systems
 * in your Express.js backend.
 */

const express = require('express');
const router = express.Router();
const {
  SquareIntegration,
  ToastIntegration,
  ShopifyIntegration,
  CloverIntegration,
  LightspeedIntegration,
  generateState,
  storeOAuthState,
  verifyOAuthState
} = require('./pos-oauth-handlers');

// In production, store these in environment variables
const POS_CONFIGS = {
  square: {
    applicationId: process.env.SQUARE_APP_ID,
    applicationSecret: process.env.SQUARE_APP_SECRET,
    redirectUri: process.env.SQUARE_REDIRECT_URI,
    environment: process.env.SQUARE_ENV || 'sandbox'
  },
  toast: {
    clientId: process.env.TOAST_CLIENT_ID,
    clientSecret: process.env.TOAST_CLIENT_SECRET,
    environment: process.env.TOAST_ENV || 'sandbox'
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    redirectUri: process.env.SHOPIFY_REDIRECT_URI
  },
  clover: {
    appId: process.env.CLOVER_APP_ID,
    appSecret: process.env.CLOVER_APP_SECRET,
    redirectUri: process.env.CLOVER_REDIRECT_URI,
    environment: process.env.CLOVER_ENV || 'sandbox',
    region: process.env.CLOVER_REGION || 'us'
  },
  lightspeed: {
    clientId: process.env.LIGHTSPEED_CLIENT_ID,
    clientSecret: process.env.LIGHTSPEED_CLIENT_SECRET,
    redirectUri: process.env.LIGHTSPEED_REDIRECT_URI,
    environment: process.env.LIGHTSPEED_ENV || 'sandbox'
  }
};

// ============================================================================
// SQUARE ROUTES
// ============================================================================

/**
 * POST /api/pos/square/connect
 * Initiate Square OAuth flow
 */
router.post('/square/connect', async (req, res) => {
  try {
    const { userId, storeId } = req.body;
    
    const square = new SquareIntegration(POS_CONFIGS.square);
    const state = generateState();
    
    // Store state with user/store info for callback verification
    await storeOAuthState(state, { 
      userId, 
      storeId, 
      pos: 'square',
      timestamp: Date.now()
    });
    
    const authUrl = square.getAuthorizationUrl(state);
    
    res.json({ 
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to authorize'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/pos/square/callback
 * Handle Square OAuth callback
 */
router.get('/square/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.redirect(`/integration-error?error=${error}`);
    }
    
    // Verify state
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }
    
    const square = new SquareIntegration(POS_CONFIGS.square);
    const tokenData = await square.exchangeCodeForToken(code);
    
    // Store tokens securely in database
    await storeTokens(stateData.userId, 'square', {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      merchantId: tokenData.merchantId,
      storeId: stateData.storeId
    });
    
    res.redirect('/integration-success?pos=square');
  } catch (error) {
    res.redirect(`/integration-error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /api/pos/square/refresh
 * Refresh Square access token
 */
router.post('/square/refresh', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const tokens = await getTokens(userId, 'square');
    const square = new SquareIntegration(POS_CONFIGS.square);
    
    const newTokenData = await square.refreshAccessToken(tokens.refreshToken);
    
    await updateTokens(userId, 'square', {
      accessToken: newTokenData.accessToken,
      expiresAt: newTokenData.expiresAt
    });
    
    res.json({ success: true, message: 'Token refreshed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TOAST ROUTES
// ============================================================================

/**
 * POST /api/pos/toast/connect
 * Authenticate with Toast (direct authentication, not OAuth redirect)
 */
router.post('/toast/connect', async (req, res) => {
  try {
    const { userId, restaurantGuid, userAccessType } = req.body;
    
    const toast = new ToastIntegration({
      ...POS_CONFIGS.toast,
      restaurantGuid,
      userAccessType: userAccessType || 'TOAST_MACHINE_CLIENT'
    });
    
    const tokenData = await toast.authenticate();
    
    // Store tokens
    await storeTokens(userId, 'toast', {
      accessToken: tokenData.accessToken,
      expiresIn: tokenData.expiresIn,
      restaurantGuid,
      authenticatedAt: Date.now()
    });
    
    res.json({ 
      success: true,
      message: 'Toast integration connected successfully',
      expiresIn: tokenData.expiresIn
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pos/toast/refresh
 * Refresh Toast authentication token
 */
router.post('/toast/refresh', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const tokens = await getTokens(userId, 'toast');
    const toast = new ToastIntegration({
      ...POS_CONFIGS.toast,
      restaurantGuid: tokens.restaurantGuid
    });
    
    const newTokenData = await toast.refreshToken();
    
    await updateTokens(userId, 'toast', {
      accessToken: newTokenData.accessToken,
      expiresIn: newTokenData.expiresIn,
      authenticatedAt: Date.now()
    });
    
    res.json({ success: true, message: 'Token refreshed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SHOPIFY ROUTES
// ============================================================================

/**
 * POST /api/pos/shopify/connect
 * Initiate Shopify OAuth flow
 */
router.post('/shopify/connect', async (req, res) => {
  try {
    const { userId, shopDomain } = req.body;
    
    const shopify = new ShopifyIntegration({
      ...POS_CONFIGS.shopify,
      shopDomain
    });
    
    const state = generateState();
    
    await storeOAuthState(state, { 
      userId, 
      shopDomain,
      pos: 'shopify',
      timestamp: Date.now()
    });
    
    const authUrl = shopify.getAuthorizationUrl(state);
    
    res.json({ 
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to authorize'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pos/shopify/callback
 * Handle Shopify OAuth callback
 */
router.get('/shopify/callback', async (req, res) => {
  try {
    const { code, state, shop, hmac } = req.query;
    
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }
    
    // Verify HMAC (important for security)
    // Implementation depends on how Shopify calculates HMAC
    
    const shopify = new ShopifyIntegration({
      ...POS_CONFIGS.shopify,
      shopDomain: shop
    });
    
    const tokenData = await shopify.exchangeCodeForToken(code);
    
    await storeTokens(stateData.userId, 'shopify', {
      accessToken: tokenData.accessToken,
      scope: tokenData.scope,
      shopDomain: shop
    });
    
    res.redirect('/integration-success?pos=shopify');
  } catch (error) {
    res.redirect(`/integration-error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /api/pos/shopify/webhook
 * Handle Shopify webhooks
 */
router.post('/shopify/webhook', async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const shop = req.headers['x-shopify-shop-domain'];
    const topic = req.headers['x-shopify-topic'];
    
    const shopify = new ShopifyIntegration({
      ...POS_CONFIGS.shopify,
      shopDomain: shop
    });
    
    const rawBody = JSON.stringify(req.body);
    const isValid = shopify.verifyWebhook(rawBody, hmac);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    // Process webhook based on topic
    console.log(`Webhook received: ${topic}`, req.body);
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CLOVER ROUTES
// ============================================================================

/**
 * POST /api/pos/clover/connect
 * Initiate Clover OAuth flow
 */
router.post('/clover/connect', async (req, res) => {
  try {
    const { userId, merchantId, region } = req.body;
    
    const clover = new CloverIntegration({
      ...POS_CONFIGS.clover,
      merchantId,
      region: region || 'us'
    });
    
    const state = generateState();
    
    await storeOAuthState(state, { 
      userId, 
      merchantId,
      region,
      pos: 'clover',
      timestamp: Date.now()
    });
    
    const authUrl = clover.getAuthorizationUrl(state);
    
    res.json({ 
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to authorize'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pos/clover/callback
 * Handle Clover OAuth callback
 */
router.get('/clover/callback', async (req, res) => {
  try {
    const { code, merchant_id, employee_id, client_id, state } = req.query;
    
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }
    
    const clover = new CloverIntegration({
      ...POS_CONFIGS.clover,
      merchantId: merchant_id
    });
    
    const tokenData = await clover.exchangeCodeForToken(code);
    
    await storeTokens(stateData.userId, 'clover', {
      accessToken: tokenData.accessToken,
      merchantId: merchant_id,
      employeeId: employee_id
    });
    
    res.redirect('/integration-success?pos=clover');
  } catch (error) {
    res.redirect(`/integration-error?error=${encodeURIComponent(error.message)}`);
  }
});

// ============================================================================
// LIGHTSPEED ROUTES
// ============================================================================

/**
 * POST /api/pos/lightspeed/connect
 * Initiate Lightspeed OAuth flow
 */
router.post('/lightspeed/connect', async (req, res) => {
  try {
    const { userId, accountId, productLine } = req.body;
    
    if (!['retail', 'restaurant', 'xseries'].includes(productLine)) {
      throw new Error('Invalid product line. Must be retail, restaurant, or xseries');
    }
    
    const lightspeed = new LightspeedIntegration({
      ...POS_CONFIGS.lightspeed,
      accountId,
      productLine
    });
    
    const state = generateState();
    
    await storeOAuthState(state, { 
      userId, 
      accountId,
      productLine,
      pos: 'lightspeed',
      timestamp: Date.now()
    });
    
    const authUrl = lightspeed.getAuthorizationUrl(state);
    
    res.json({ 
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to authorize'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pos/lightspeed/callback
 * Handle Lightspeed OAuth callback
 */
router.get('/lightspeed/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.redirect(`/integration-error?error=${error}`);
    }
    
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }
    
    const lightspeed = new LightspeedIntegration({
      ...POS_CONFIGS.lightspeed,
      accountId: stateData.accountId,
      productLine: stateData.productLine
    });
    
    const tokenData = await lightspeed.exchangeCodeForToken(code);
    
    await storeTokens(stateData.userId, 'lightspeed', {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      scope: tokenData.scope,
      accountId: stateData.accountId,
      productLine: stateData.productLine
    });
    
    res.redirect('/integration-success?pos=lightspeed');
  } catch (error) {
    res.redirect(`/integration-error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /api/pos/lightspeed/refresh
 * Refresh Lightspeed access token
 */
router.post('/lightspeed/refresh', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const tokens = await getTokens(userId, 'lightspeed');
    const lightspeed = new LightspeedIntegration({
      ...POS_CONFIGS.lightspeed,
      accountId: tokens.accountId,
      productLine: tokens.productLine
    });
    
    const newTokenData = await lightspeed.refreshAccessToken(tokens.refreshToken);
    
    await updateTokens(userId, 'lightspeed', {
      accessToken: newTokenData.accessToken,
      refreshToken: newTokenData.refreshToken,
      expiresIn: newTokenData.expiresIn
    });
    
    res.json({ success: true, message: 'Token refreshed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GENERIC API CALL ROUTE (for testing)
// ============================================================================

/**
 * POST /api/pos/:provider/call
 * Make an API call to the specified POS provider
 */
router.post('/:provider/call', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId, endpoint, method, data } = req.body;
    
    const tokens = await getTokens(userId, provider);
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated with this provider' });
    }
    
    let integration;
    let result;
    
    switch (provider) {
      case 'square':
        integration = new SquareIntegration(POS_CONFIGS.square);
        result = await integration.makeApiCall(endpoint, tokens.accessToken, method, data);
        break;
        
      case 'toast':
        integration = new ToastIntegration({
          ...POS_CONFIGS.toast,
          restaurantGuid: tokens.restaurantGuid
        });
        result = await integration.makeApiCall(endpoint, tokens.accessToken, method, data);
        break;
        
      case 'shopify':
        integration = new ShopifyIntegration({
          ...POS_CONFIGS.shopify,
          shopDomain: tokens.shopDomain
        });
        result = await integration.makeApiCall(endpoint, tokens.accessToken, method, data);
        break;
        
      case 'clover':
        integration = new CloverIntegration({
          ...POS_CONFIGS.clover,
          merchantId: tokens.merchantId
        });
        result = await integration.makeApiCall(endpoint, tokens.accessToken, method, data);
        break;
        
      case 'lightspeed':
        integration = new LightspeedIntegration({
          ...POS_CONFIGS.lightspeed,
          accountId: tokens.accountId,
          productLine: tokens.productLine
        });
        result = await integration.makeApiCall(endpoint, tokens.accessToken, method, data);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS (implement with your database)
// ============================================================================

async function storeTokens(userId, provider, tokenData) {
  // Store tokens in your database
  // Encrypt sensitive data before storage
  console.log(`Storing tokens for user ${userId}, provider ${provider}`, {
    ...tokenData,
    accessToken: '[REDACTED]',
    refreshToken: '[REDACTED]'
  });
}

async function getTokens(userId, provider) {
  // Retrieve tokens from your database
  // Decrypt before returning
  console.log(`Getting tokens for user ${userId}, provider ${provider}`);
  return null; // Replace with actual implementation
}

async function updateTokens(userId, provider, tokenData) {
  // Update specific token fields in your database
  console.log(`Updating tokens for user ${userId}, provider ${provider}`, {
    ...tokenData,
    accessToken: '[REDACTED]',
    refreshToken: '[REDACTED]'
  });
}

module.exports = router;
