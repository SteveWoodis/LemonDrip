

import SuperTokens from "supertokens-web-js";
import Session from "supertokens-web-js/recipe/session";

const isMultitenancy = false;

export function getApiDomain() {
    const apiPort = 3001;
    const apiUrl = `http://localhost:${apiPort}`;
    return apiUrl;
}

export function getWebsiteDomain() {
    const websitePort = 3000;
    const websiteUrl = `http://localhost:${websitePort}`;
    return websiteUrl;
}

export function initSuperTokensUI() {
    (window as any).supertokensUIInit("supertokensui", {
        appInfo: {
            websiteDomain: getWebsiteDomain(),
            apiDomain: getApiDomain(),
            appName: "SuperTokens Demo App",
            websiteBasePath: "/auth",
            apiBasePath: "/auth",
        },
        
        recipeList: [
            (window as any).supertokensUISession.init(),
            (window as any).supertokensUIEmailPassword.init()
        ],
        getRedirectionURL: async (context: any) => {
            if (context.action === "SUCCESS") {
                return "/dashboard";
            }
            return undefined;
        },
    });
}

export function initSuperTokensWebJS() {
    SuperTokens.init({
        appInfo: {
            appName: "SuperTokens Demo App",
            apiDomain: getApiDomain(),
            apiBasePath: "/auth",
        },
        recipeList: [
            Session.init()
        ]
    });

    if (isMultitenancy) {
        initTenantSelectorInterface();
    }
}

export async function initTenantSelectorInterface() { /* STUB, to prevent linters complaining */ };;