import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Info } from 'lucide-react';

const POSIntegrationForm = () => {
  const [selectedPOS, setSelectedPOS] = useState('');
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const posConfigs = {
    square: {
      name: 'Square',
      authType: 'OAuth 2.0',
      description: 'Connect your Square account to sync payments, inventory, and customer data.',
      docsUrl: 'https://developer.squareup.com/docs/oauth-api/overview',
      fields: [
        {
          id: 'applicationId',
          label: 'Application ID',
          type: 'text',
          placeholder: 'sq0idp-...',
          required: true,
          helpText: 'Found in your Square Developer Dashboard under your application settings'
        },
        {
          id: 'applicationSecret',
          label: 'Application Secret',
          type: 'password',
          placeholder: 'sq0csp-...',
          required: true,
          helpText: 'Keep this secret secure - never expose it in client-side code'
        },
        {
          id: 'environment',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'sandbox', label: 'Sandbox (Testing)' },
            { value: 'production', label: 'Production' }
          ],
          required: true,
          helpText: 'Use Sandbox for testing, Production for live data'
        },
        {
          id: 'redirectUri',
          label: 'OAuth Redirect URI',
          type: 'text',
          placeholder: 'https://yourapp.com/oauth/callback',
          required: true,
          helpText: 'Must match the redirect URI configured in your Square application'
        }
      ],
      scopes: [
        'MERCHANT_PROFILE_READ',
        'PAYMENTS_READ',
        'PAYMENTS_WRITE',
        'ORDERS_READ',
        'ORDERS_WRITE',
        'ITEMS_READ',
        'ITEMS_WRITE',
        'INVENTORY_READ',
        'INVENTORY_WRITE',
        'CUSTOMERS_READ',
        'CUSTOMERS_WRITE'
      ]
    },
    toast: {
      name: 'Toast',
      authType: 'Client Credentials',
      description: 'Integrate with Toast to manage restaurant orders, menus, and payments.',
      docsUrl: 'https://doc.toasttab.com/doc/devguide/authentication.html',
      fields: [
        {
          id: 'clientId',
          label: 'Client ID',
          type: 'text',
          placeholder: 'Your Toast Client ID',
          required: true,
          helpText: 'Provided by Toast integrations team when you register your integration'
        },
        {
          id: 'clientSecret',
          label: 'Client Secret',
          type: 'password',
          placeholder: 'Your Toast Client Secret',
          required: true,
          helpText: 'Store securely - never commit to version control'
        },
        {
          id: 'restaurantGuid',
          label: 'Restaurant GUID',
          type: 'text',
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          required: true,
          helpText: 'The unique identifier for the restaurant location'
        },
        {
          id: 'environment',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'sandbox', label: 'Sandbox (Testing)' },
            { value: 'production', label: 'Production' }
          ],
          required: true
        },
        {
          id: 'userAccessType',
          label: 'User Access Type',
          type: 'select',
          options: [
            { value: 'TOAST_MACHINE_CLIENT', label: 'Toast Machine Client' },
            { value: 'PARTNER', label: 'Partner' }
          ],
          required: true,
          helpText: 'TOAST_MACHINE_CLIENT for restaurant group access, PARTNER for multi-restaurant access'
        }
      ]
    },
    shopify: {
      name: 'Shopify POS',
      authType: 'OAuth 2.0',
      description: 'Connect Shopify to unify online and in-store sales, inventory, and customers.',
      docsUrl: 'https://shopify.dev/docs/apps/build/authentication-authorization',
      fields: [
        {
          id: 'apiKey',
          label: 'API Key (Client ID)',
          type: 'text',
          placeholder: 'Your Shopify API Key',
          required: true,
          helpText: 'Found in your Shopify Partner Dashboard or custom app settings'
        },
        {
          id: 'apiSecret',
          label: 'API Secret Key',
          type: 'password',
          placeholder: 'Your Shopify API Secret',
          required: true,
          helpText: 'Keep this secret secure'
        },
        {
          id: 'shopDomain',
          label: 'Shop Domain',
          type: 'text',
          placeholder: 'your-store.myshopify.com',
          required: true,
          helpText: 'Your Shopify store domain (without https://)'
        },
        {
          id: 'accessToken',
          label: 'Access Token (Optional)',
          type: 'password',
          placeholder: 'shpat_...',
          required: false,
          helpText: 'For custom apps created in Shopify admin. Leave blank to use OAuth flow.'
        },
        {
          id: 'redirectUri',
          label: 'OAuth Redirect URI',
          type: 'text',
          placeholder: 'https://yourapp.com/auth/shopify/callback',
          required: true,
          helpText: 'Must be whitelisted in your Shopify app settings'
        }
      ],
      scopes: [
        'read_products',
        'write_products',
        'read_orders',
        'write_orders',
        'read_inventory',
        'write_inventory',
        'read_customers',
        'write_customers',
        'read_locations',
        'read_price_rules',
        'write_price_rules'
      ]
    },
    clover: {
      name: 'Clover',
      authType: 'OAuth 2.0',
      description: 'Integrate with Clover for payment processing, inventory, and merchant management.',
      docsUrl: 'https://docs.clover.com/dev/docs/clover-development-basics-web-app',
      fields: [
        {
          id: 'appId',
          label: 'App ID (Client ID)',
          type: 'text',
          placeholder: 'Your Clover App ID',
          required: true,
          helpText: 'Found in your Clover Developer Dashboard when you create an app'
        },
        {
          id: 'appSecret',
          label: 'App Secret',
          type: 'password',
          placeholder: 'Your Clover App Secret',
          required: true,
          helpText: 'Keep this confidential'
        },
        {
          id: 'merchantId',
          label: 'Merchant ID',
          type: 'text',
          placeholder: 'Clover Merchant ID',
          required: true,
          helpText: 'The unique identifier for the Clover merchant account'
        },
        {
          id: 'environment',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'sandbox', label: 'Sandbox (Testing)' },
            { value: 'production', label: 'Production' }
          ],
          required: true
        },
        {
          id: 'region',
          label: 'Region',
          type: 'select',
          options: [
            { value: 'us', label: 'United States' },
            { value: 'ca', label: 'Canada' },
            { value: 'eu', label: 'Europe' }
          ],
          required: true,
          helpText: 'Select the geographic region for your Clover account'
        },
        {
          id: 'redirectUri',
          label: 'OAuth Redirect URI',
          type: 'text',
          placeholder: 'https://yourapp.com/oauth/clover',
          required: true,
          helpText: 'Must match the Site URL configured in your Clover app settings'
        }
      ],
      permissions: [
        'ORDERS_R',
        'ORDERS_W',
        'MERCHANT_R',
        'MERCHANT_W',
        'INVENTORY_R',
        'INVENTORY_W',
        'CUSTOMERS_R',
        'CUSTOMERS_W',
        'PAYMENTS_R',
        'PAYMENTS_W'
      ]
    },
    lightspeed: {
      name: 'Lightspeed',
      authType: 'OAuth 2.0',
      description: 'Connect Lightspeed Retail or Restaurant POS for comprehensive business management.',
      docsUrl: 'https://developers.lightspeedhq.com/retail/authentication/authentication-overview/',
      fields: [
        {
          id: 'productLine',
          label: 'Product Line',
          type: 'select',
          options: [
            { value: 'retail', label: 'Lightspeed Retail (R-Series)' },
            { value: 'restaurant', label: 'Lightspeed Restaurant (K-Series)' },
            { value: 'xseries', label: 'Lightspeed X-Series' }
          ],
          required: true,
          helpText: 'Select which Lightspeed product you are using'
        },
        {
          id: 'clientId',
          label: 'Client ID',
          type: 'text',
          placeholder: 'Your Lightspeed Client ID',
          required: true,
          helpText: 'Obtained when you register your application with Lightspeed'
        },
        {
          id: 'clientSecret',
          label: 'Client Secret',
          type: 'password',
          placeholder: 'Your Lightspeed Client Secret',
          required: true,
          helpText: 'Keep this secret secure'
        },
        {
          id: 'accountId',
          label: 'Account ID',
          type: 'text',
          placeholder: 'Lightspeed Account ID',
          required: true,
          helpText: 'For Retail: Your account number. For Restaurant: Business Location ID'
        },
        {
          id: 'environment',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'sandbox', label: 'Sandbox/Trial (Testing)' },
            { value: 'production', label: 'Production' }
          ],
          required: true
        },
        {
          id: 'redirectUri',
          label: 'OAuth Redirect URI',
          type: 'text',
          placeholder: 'https://yourapp.com/lightspeed/callback',
          required: true,
          helpText: 'Must match the redirect URI in your Lightspeed app settings'
        }
      ],
      scopes: {
        retail: ['employee:all', 'inventory:all', 'sales:all', 'customers:all'],
        restaurant: ['financial-api', 'orders-api'],
        xseries: ['sales', 'inventory', 'customers', 'products']
      }
    }
  };

  const handlePOSChange = (pos) => {
    setSelectedPOS(pos);
    setFormData({});
    setErrors({});
    setConnectionStatus(null);
  };

  const handleFieldChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
    // Clear error for this field when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const config = posConfigs[selectedPOS];
    
    config.fields.forEach(field => {
      if (field.required && !formData[field.id]) {
        newErrors[field.id] = `${field.label} is required`;
      }
      
      // Additional validation
      if (field.id === 'shopDomain' && formData[field.id]) {
        if (!formData[field.id].endsWith('.myshopify.com')) {
          newErrors[field.id] = 'Domain must end with .myshopify.com';
        }
      }
      
      if (field.id === 'redirectUri' && formData[field.id]) {
        try {
          new URL(formData[field.id]);
        } catch (e) {
          newErrors[field.id] = 'Must be a valid URL';
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const initiateOAuthFlow = async () => {
    if (!validateForm()) {
      return;
    }

    setIsConnecting(true);
    
    try {
      // This is where you would implement the actual OAuth flow
      // For now, this is a simulation
      
      let authUrl = '';
      const config = posConfigs[selectedPOS];
      
      switch (selectedPOS) {
        case 'square':
          authUrl = formData.environment === 'sandbox'
            ? 'https://connect.squareupsandbox.com/oauth2/authorize'
            : 'https://connect.squareup.com/oauth2/authorize';
          authUrl += `?client_id=${formData.applicationId}`;
          authUrl += `&scope=${config.scopes.join('+')}`;
          authUrl += `&state=${generateState()}`;
          break;
          
        case 'toast':
          // Toast uses a different authentication flow - direct token exchange
          const toastUrl = formData.environment === 'sandbox'
            ? 'https://toast-api-server/authentication/v1/authentication/login'
            : 'https://toast-api-server/authentication/v1/authentication/login';
          
          // This would be a server-side call
          console.log('Toast authentication payload:', {
            clientId: formData.clientId,
            clientSecret: '[REDACTED]',
            userAccessType: formData.userAccessType
          });
          break;
          
        case 'shopify':
          authUrl = `https://${formData.shopDomain}/admin/oauth/authorize`;
          authUrl += `?client_id=${formData.apiKey}`;
          authUrl += `&scope=${config.scopes.join(',')}`;
          authUrl += `&redirect_uri=${encodeURIComponent(formData.redirectUri)}`;
          authUrl += `&state=${generateState()}`;
          break;
          
        case 'clover':
          authUrl = formData.environment === 'sandbox'
            ? 'https://sandbox.dev.clover.com/oauth/authorize'
            : 'https://www.clover.com/oauth/authorize';
          authUrl += `?client_id=${formData.appId}`;
          authUrl += `&redirect_uri=${encodeURIComponent(formData.redirectUri)}`;
          break;
          
        case 'lightspeed':
          const productLine = formData.productLine;
          if (productLine === 'retail') {
            authUrl = 'https://cloud.lightspeedapp.com/oauth/authorize.php';
            authUrl += `?response_type=code`;
            authUrl += `&client_id=${formData.clientId}`;
            authUrl += `&scope=${config.scopes.retail.join('+')}`;
          } else if (productLine === 'restaurant') {
            const baseUrl = formData.environment === 'sandbox'
              ? 'https://api.trial.lsk.lightspeed.app'
              : 'https://api.lsk.lightspeed.app';
            authUrl = `${baseUrl}/oauth/authorize`;
            authUrl += `?response_type=code`;
            authUrl += `&client_id=${formData.clientId}`;
            authUrl += `&scope=${encodeURIComponent(config.scopes.restaurant.join(' '))}`;
          }
          authUrl += `&redirect_uri=${encodeURIComponent(formData.redirectUri)}`;
          authUrl += `&state=${generateState()}`;
          break;
      }
      
      // Store connection data (in production, this would go to your backend)
      const connectionData = {
        pos: selectedPOS,
        timestamp: new Date().toISOString(),
        credentials: formData,
        authUrl
      };
      
      console.log('Connection Data:', {
        ...connectionData,
        credentials: { ...connectionData.credentials, [selectedPOS === 'square' ? 'applicationSecret' : 'clientSecret']: '[REDACTED]' }
      });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setConnectionStatus({
        type: 'success',
        message: 'Credentials validated! Redirecting to authorization...',
        authUrl
      });
      
      // In production, redirect to authUrl or open in popup
      // window.location.href = authUrl;
      
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: error.message || 'Failed to connect. Please check your credentials.'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const generateState = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const renderField = (field) => {
    const value = formData[field.id] || '';
    const error = errors[field.id];

    return (
      <div key={field.id} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        {field.type === 'select' ? (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select {field.label}</option>
            {field.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            type={field.type}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        )}
        
        {field.helpText && !error && (
          <p className="text-xs text-gray-500 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{field.helpText}</span>
          </p>
        )}
        
        {error && (
          <p className="text-xs text-red-500 flex items-start gap-1">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">POS System Integration</h1>
          <p className="mt-2 text-gray-600">
            Connect your Point-of-Sale system to sync data with your application
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* POS Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Your POS System
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(posConfigs).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => handlePOSChange(key)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedPOS === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{config.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{config.authType}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Form */}
          {selectedPOS && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-700">
                      {posConfigs[selectedPOS].description}
                    </p>
                    <a
                      href={posConfigs[selectedPOS].docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-2"
                    >
                      View Documentation <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {posConfigs[selectedPOS].fields.map(field => renderField(field))}
              </div>

              {/* Scopes/Permissions Info */}
              {(posConfigs[selectedPOS].scopes || posConfigs[selectedPOS].permissions) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Required Permissions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(posConfigs[selectedPOS].scopes || posConfigs[selectedPOS].permissions)
                      .slice(0, selectedPOS === 'lightspeed' ? 
                        posConfigs[selectedPOS].scopes[formData.productLine || 'retail'].length : 
                        undefined)
                      .map((scope, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-600"
                        >
                          {selectedPOS === 'lightspeed' && formData.productLine 
                            ? posConfigs[selectedPOS].scopes[formData.productLine][idx] || scope
                            : scope}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Connection Status */}
              {connectionStatus && (
                <div className={`rounded-lg p-4 ${
                  connectionStatus.type === 'success' 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {connectionStatus.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        connectionStatus.type === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {connectionStatus.message}
                      </p>
                      {connectionStatus.authUrl && (
                        <a
                          href={connectionStatus.authUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-2"
                        >
                          Open Authorization Page <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Connect Button */}
              <button
                onClick={initiateOAuthFlow}
                disabled={isConnecting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {isConnecting ? 'Connecting...' : 'Connect to ' + posConfigs[selectedPOS].name}
              </button>
            </>
          )}

          {!selectedPOS && (
            <div className="text-center py-12 text-gray-500">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a POS system above to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default POSIntegrationForm;
