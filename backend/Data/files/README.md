# POS Integration Authentication System

Complete OAuth 2.0 integration solution for the 5 most important Point-of-Sale systems worldwide: Square, Toast, Shopify POS, Clover, and Lightspeed.

## Table of Contents

- [Overview](#overview)
- [Supported POS Systems](#supported-pos-systems)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

This integration system provides:

- **React frontend form** for collecting authentication credentials
- **Node.js backend handlers** for OAuth flows
- **Express.js routes** for managing connections
- **Secure token management** with refresh capabilities
- **Webhook handling** for real-time updates

## Supported POS Systems

### 1. Square
- **Market Share**: ~28%
- **Auth Type**: OAuth 2.0
- **Token Expiry**: 30 days
- **Refresh Token**: Long-lived, doesn't expire
- **Documentation**: https://developer.squareup.com/docs/oauth-api/overview

### 2. Toast
- **Market Share**: ~23-24%
- **Auth Type**: Client Credentials (Direct Authentication)
- **Token Expiry**: ~60 minutes
- **Refresh**: Re-authenticate
- **Documentation**: https://doc.toasttab.com/doc/devguide/authentication.html

### 3. Shopify POS
- **Market Share**: Significant for omnichannel
- **Auth Type**: OAuth 2.0
- **Token Expiry**: Does not expire (unless revoked)
- **Refresh Token**: Not provided
- **Documentation**: https://shopify.dev/docs/apps/build/authentication-authorization

### 4. Clover
- **Market Share**: ~6-7%
- **Auth Type**: OAuth 2.0
- **Token Expiry**: Does not expire in production
- **Refresh Token**: Not needed
- **Documentation**: https://docs.clover.com/dev/docs/clover-development-basics-web-app

### 5. Lightspeed
- **Market Share**: Growing specialty retail
- **Auth Type**: OAuth 2.0
- **Token Expiry**: 1 hour (Restaurant), varies (Retail)
- **Refresh Token**: Provided, doesn't expire (Retail), Single-use 90-day (Restaurant)
- **Documentation**: https://developers.lightspeedhq.com/

## Architecture

```
┌─────────────────┐
│  React Frontend │  (pos-integration-form.jsx)
│  Auth Form      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Express Routes │  (pos-routes.js)
│  /api/pos/*     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OAuth Handlers │  (pos-oauth-handlers.js)
│  Integration    │  - SquareIntegration
│  Classes        │  - ToastIntegration
│                 │  - ShopifyIntegration
│                 │  - CloverIntegration
│                 │  - LightspeedIntegration
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   POS APIs      │
│   OAuth Servers │
└─────────────────┘
```

## Installation

### Prerequisites

- Node.js 16+ and npm
- React 17+
- PostgreSQL or MongoDB (for token storage)
- Redis (recommended for state management)

### Backend Setup

```bash
# Install dependencies
npm install express axios crypto dotenv

# For database (choose one)
npm install pg          # PostgreSQL
npm install mongodb     # MongoDB
npm install redis       # Redis for state
```

### Frontend Setup

```bash
# Install dependencies
npm install react lucide-react

# Or if using Tailwind CSS
npm install -D tailwindcss
```

## Configuration

### 1. Environment Variables

Create a `.env` file:

```env
# Server
PORT=3000
NODE_ENV=production

# Square
SQUARE_APP_ID=sq0idp-xxxxx
SQUARE_APP_SECRET=sq0csp-xxxxx
SQUARE_REDIRECT_URI=https://yourapp.com/api/pos/square/callback
SQUARE_ENV=production

# Toast
TOAST_CLIENT_ID=your-toast-client-id
TOAST_CLIENT_SECRET=your-toast-client-secret
TOAST_ENV=production

# Shopify
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-secret
SHOPIFY_REDIRECT_URI=https://yourapp.com/api/pos/shopify/callback

# Clover
CLOVER_APP_ID=your-clover-app-id
CLOVER_APP_SECRET=your-clover-secret
CLOVER_REDIRECT_URI=https://yourapp.com/api/pos/clover/callback
CLOVER_ENV=production
CLOVER_REGION=us

# Lightspeed
LIGHTSPEED_CLIENT_ID=your-lightspeed-client-id
LIGHTSPEED_CLIENT_SECRET=your-lightspeed-secret
LIGHTSPEED_REDIRECT_URI=https://yourapp.com/api/pos/lightspeed/callback
LIGHTSPEED_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pos_integrations
REDIS_URL=redis://localhost:6379

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 2. Register Your Applications

#### Square
1. Go to https://developer.squareup.com/apps
2. Create a new application
3. Note your Application ID and Secret
4. Add your redirect URI to allowed redirect URLs
5. Set required OAuth scopes

#### Toast
1. Contact Toast Integrations Team (developer.support@toasttab.com)
2. Request API credentials
3. Provide your integration details
4. Receive Client ID, Secret, and sandbox hostname

#### Shopify
1. Go to https://partners.shopify.com/
2. Create a new app or custom app
3. Configure OAuth redirect URLs
4. Set required API scopes
5. Note your API key and secret

#### Clover
1. Go to https://www.clover.com/developers
2. Create developer account
3. Create a new Web app
4. Configure Site URL (redirect URI)
5. Note App ID and App Secret

#### Lightspeed
1. Register at appropriate developer portal:
   - Retail: https://cloud.lightspeedapp.com/
   - Restaurant: https://api-portal.lsk.lightspeed.app/
2. Create OAuth client
3. Configure redirect URI
4. Note Client ID and Secret

## Usage

### Frontend Integration

```jsx
import POSIntegrationForm from './pos-integration-form';

function App() {
  return (
    <div className="App">
      <POSIntegrationForm />
    </div>
  );
}
```

### Backend Integration

```javascript
const express = require('express');
const posRoutes = require('./pos-routes');

const app = express();

app.use(express.json());
app.use('/api/pos', posRoutes);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Example: Connecting a User to Square

```javascript
// Frontend: User fills form and submits
const response = await fetch('/api/pos/square/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: currentUser.id,
    storeId: currentStore.id
  })
});

const { authUrl } = await response.json();

// Redirect user to Square authorization page
window.location.href = authUrl;

// After user authorizes, Square redirects to your callback
// Your backend handles the callback and exchanges code for tokens
```

### Example: Making API Calls

```javascript
// Get Square locations
const response = await fetch('/api/pos/square/call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: currentUser.id,
    endpoint: 'locations',
    method: 'GET'
  })
});

const { data } = await response.json();
console.log('Locations:', data.locations);
```

## API Reference

### Common Endpoints

All POS providers support these endpoints:

#### POST /api/pos/:provider/connect
Initiate OAuth flow for the provider.

**Request Body:**
```json
{
  "userId": "user123",
  // Provider-specific fields
}
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://provider.com/oauth/authorize?..."
}
```

#### GET /api/pos/:provider/callback
OAuth callback endpoint (handled automatically by browser redirect).

**Query Parameters:**
- `code`: Authorization code
- `state`: State parameter for CSRF protection

#### POST /api/pos/:provider/refresh
Refresh expired access token.

**Request Body:**
```json
{
  "userId": "user123"
}
```

#### POST /api/pos/:provider/call
Make an authenticated API call to the provider.

**Request Body:**
```json
{
  "userId": "user123",
  "endpoint": "orders",
  "method": "GET",
  "data": {}
}
```

### Provider-Specific Examples

#### Square: List Catalog Items
```javascript
await fetch('/api/pos/square/call', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    endpoint: 'catalog/list',
    method: 'GET'
  })
});
```

#### Toast: Get Orders
```javascript
await fetch('/api/pos/toast/call', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    endpoint: 'orders/v2/orders',
    method: 'GET'
  })
});
```

#### Shopify: List Products
```javascript
await fetch('/api/pos/shopify/call', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    endpoint: 'products.json',
    method: 'GET'
  })
});
```

#### Clover: Get Merchant Info
```javascript
await fetch('/api/pos/clover/call', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    endpoint: 'merchants/{merchantId}',
    method: 'GET'
  })
});
```

#### Lightspeed: Get Sales
```javascript
await fetch('/api/pos/lightspeed/call', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user123',
    endpoint: 'Sale.json',
    method: 'GET'
  })
});
```

## Security Best Practices

### 1. Token Storage

**NEVER store tokens in:**
- Frontend localStorage/sessionStorage
- Client-side cookies
- Version control
- Logs

**ALWAYS:**
- Encrypt tokens at rest
- Use secure HTTP-only cookies for session management
- Implement token rotation
- Set appropriate token scopes

### 2. Environment Variables

```javascript
// ❌ DON'T
const apiKey = 'sq0idp-hardcoded-key';

// ✅ DO
const apiKey = process.env.SQUARE_APP_ID;
```

### 3. HTTPS Only

All OAuth redirects and API calls must use HTTPS in production.

### 4. State Parameter Validation

Always validate the state parameter to prevent CSRF attacks:

```javascript
// Generate secure random state
const state = crypto.randomBytes(32).toString('hex');

// Store with expiry (e.g., 10 minutes)
await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({ userId }));

// Verify on callback
const stateData = await redis.get(`oauth:state:${state}`);
if (!stateData) {
  throw new Error('Invalid or expired state');
}
```

### 5. Webhook Verification

Always verify webhook signatures:

```javascript
// Shopify example
const hmac = req.headers['x-shopify-hmac-sha256'];
const hash = crypto
  .createHmac('sha256', apiSecret)
  .update(rawBody)
  .digest('base64');

if (hash !== hmac) {
  throw new Error('Invalid webhook signature');
}
```

## Token Management

### Token Refresh Strategy

Implement automatic token refresh before expiry:

```javascript
// Check token expiry
const isExpired = (expiresAt) => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  return now >= (expiresAt - fiveMinutes);
};

// Refresh if needed
if (isExpired(tokens.expiresAt)) {
  await refreshToken(userId, 'square');
  tokens = await getTokens(userId, 'square');
}
```

### Token Encryption

```javascript
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decrypt(encrypted, iv, authTag) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

## Troubleshooting

### Common Issues

#### 1. "Invalid redirect URI"
- Ensure redirect URI exactly matches what's configured in the POS dashboard
- Check for trailing slashes
- Verify protocol (http vs https)

#### 2. "Invalid client credentials"
- Double-check API keys and secrets
- Ensure you're using the correct environment (sandbox vs production)
- Verify credentials haven't expired or been revoked

#### 3. "Token expired"
- Implement automatic token refresh
- Check token expiry times
- For Shopify, tokens don't expire unless revoked

#### 4. "Insufficient permissions"
- Review and request necessary OAuth scopes
- User must approve all required permissions
- Some operations require specific user roles

#### 5. "Rate limit exceeded"
- Implement exponential backoff
- Cache responses where appropriate
- Review API documentation for rate limits

### Debug Mode

Enable debug logging:

```javascript
// In development only
if (process.env.NODE_ENV === 'development') {
  axios.interceptors.request.use(request => {
    console.log('Starting Request', {
      url: request.url,
      method: request.method,
      headers: { ...request.headers, Authorization: '[REDACTED]' }
    });
    return request;
  });
}
```

### Testing

Use sandbox/test environments for all providers:

- **Square**: Sandbox environment with test cards
- **Toast**: Sandbox with test merchant accounts
- **Shopify**: Development stores
- **Clover**: Sandbox with test data
- **Lightspeed**: Trial/demo accounts

## Support

### Provider Support Contacts

- **Square**: https://developer.squareup.com/support
- **Toast**: developer.support@toasttab.com
- **Shopify**: https://partners.shopify.com/support
- **Clover**: https://community.clover.com/
- **Lightspeed**: Developer portals for each product line

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please read CONTRIBUTING.md for guidelines.

## Changelog

### Version 1.0.0
- Initial release
- Support for Square, Toast, Shopify POS, Clover, and Lightspeed
- OAuth 2.0 flows for all providers
- Token refresh mechanisms
- Webhook handling (Shopify)
- Comprehensive documentation
