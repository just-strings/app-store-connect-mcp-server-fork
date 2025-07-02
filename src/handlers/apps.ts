import { AppStoreConnectClient } from '../services/index.js';
import { ListAppsResponse, AppInfoResponse, AppIncludeOptions } from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

// Valid include options for getAppInfo as defined by App Store Connect API
const VALID_APP_INCLUDES = [
  "appClips", "appInfos", "appStoreVersions", "availableTerritories",
  "betaAppReviewDetail", "betaGroups", "betaLicenseAgreement", "builds",
  "endUserLicenseAgreement", "gameCenterEnabledVersions", "inAppPurchases",
  "preOrder", "prices", "reviewSubmissions"
];

export class AppHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listApps(args: { limit?: number } = {}): Promise<ListAppsResponse> {
    const { limit = 100 } = args;
    
    return this.client.get<ListAppsResponse>('/apps', {
      limit: sanitizeLimit(limit)
    });
  }

  async getAppInfo(args: { 
    appId: string; 
    include?: AppIncludeOptions[];
  }): Promise<AppInfoResponse> {
    const { appId, include } = args;
    
    validateRequired(args, ['appId']);

    // Validate include parameters
    if (include?.length) {
      const invalidIncludes = include.filter(inc => !VALID_APP_INCLUDES.includes(inc));
      if (invalidIncludes.length > 0) {
        throw new Error(
          `Invalid include parameters: ${invalidIncludes.join(', ')}. ` +
          `Valid options are: ${VALID_APP_INCLUDES.join(', ')}`
        );
      }
    }

    const params: Record<string, any> = {};
    if (include?.length) {
      params.include = include.join(',');
    }

    return this.client.get<AppInfoResponse>(`/apps/${appId}`, params);
  }
}