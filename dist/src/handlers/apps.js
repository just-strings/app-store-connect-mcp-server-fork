import { validateRequired, sanitizeLimit } from '../utils/index.js';
// Valid include options for getAppInfo as defined by App Store Connect API
const VALID_APP_INCLUDES = [
    "appClips", "appInfos", "appStoreVersions", "availableTerritories",
    "betaAppReviewDetail", "betaGroups", "betaLicenseAgreement", "builds",
    "endUserLicenseAgreement", "gameCenterEnabledVersions", "inAppPurchases",
    "preOrder", "prices", "reviewSubmissions"
];
export class AppHandlers {
    client;
    constructor(client) {
        this.client = client;
    }
    async listApps(args = {}) {
        const { limit = 100 } = args;
        return this.client.get('/apps', {
            limit: sanitizeLimit(limit)
        });
    }
    async getAppInfo(args) {
        const { appId, include } = args;
        validateRequired(args, ['appId']);
        // Validate include parameters
        if (include?.length) {
            const invalidIncludes = include.filter(inc => !VALID_APP_INCLUDES.includes(inc));
            if (invalidIncludes.length > 0) {
                throw new Error(`Invalid include parameters: ${invalidIncludes.join(', ')}. ` +
                    `Valid options are: ${VALID_APP_INCLUDES.join(', ')}`);
            }
        }
        const params = {};
        if (include?.length) {
            params.include = include.join(',');
        }
        return this.client.get(`/apps/${appId}`, params);
    }
}
