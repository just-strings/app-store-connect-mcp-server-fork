import { AppStoreConnectClient } from '../services/index.js';
import { 
  AnalyticsReportRequest,
  AnalyticsReportRequestResponse,
  ListAnalyticsReportsResponse,
  ListAnalyticsReportSegmentsResponse,
  AnalyticsAccessType,
  AnalyticsReportCategory,
  SalesReportResponse,
  FinanceReportResponse,
  SalesReportType,
  SalesReportSubType,
  SalesReportFrequency,
  SalesReportFilters,
  FinanceReportFilters
} from '../types/index.js';
import { validateRequired, sanitizeLimit, buildFilterParams } from '../utils/index.js';

export class AnalyticsHandlers {
  constructor(private client: AppStoreConnectClient, private config?: { vendorNumber?: string }) {}

  async createAnalyticsReportRequest(args: {
    appId: string;
    accessType?: AnalyticsAccessType;
  }): Promise<AnalyticsReportRequestResponse> {
    const { appId, accessType = "ONE_TIME_SNAPSHOT" } = args;
    
    validateRequired(args, ['appId']);

    const requestBody: AnalyticsReportRequest = {
      data: {
        type: "analyticsReportRequests",
        attributes: {
          accessType
        },
        relationships: {
          app: {
            data: {
              id: appId,
              type: "apps"
            }
          }
        }
      }
    };

    return this.client.post<AnalyticsReportRequestResponse>('/analyticsReportRequests', requestBody);
  }

  async listAnalyticsReports(args: {
    reportRequestId: string;
    limit?: number;
    filter?: {
      category?: AnalyticsReportCategory;
    };
  }): Promise<ListAnalyticsReportsResponse> {
    const { reportRequestId, limit = 100, filter } = args;
    
    validateRequired(args, ['reportRequestId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };

    Object.assign(params, buildFilterParams(filter));

    return this.client.get<ListAnalyticsReportsResponse>(`/analyticsReportRequests/${reportRequestId}/reports`, params);
  }

  async listAnalyticsReportSegments(args: {
    reportId: string;
    limit?: number;
  }): Promise<ListAnalyticsReportSegmentsResponse> {
    const { reportId, limit = 100 } = args;
    
    validateRequired(args, ['reportId']);

    return this.client.get<ListAnalyticsReportSegmentsResponse>(`/analyticsReports/${reportId}/segments`, {
      limit: sanitizeLimit(limit)
    });
  }

  async downloadAnalyticsReportSegment(args: {
    segmentUrl: string;
  }): Promise<{ data: any; contentType: string; size: string }> {
    const { segmentUrl } = args;
    
    validateRequired(args, ['segmentUrl']);

    return this.client.downloadFromUrl(segmentUrl);
  }

  async downloadSalesReport(args: {
    vendorNumber?: string;
    reportType?: SalesReportType;
    reportSubType?: SalesReportSubType;
    frequency?: SalesReportFrequency;
    reportDate: string;
  }): Promise<SalesReportResponse> {
    const { 
      vendorNumber = this.config?.vendorNumber, 
      reportType = "SALES", 
      reportSubType = "SUMMARY", 
      frequency = "MONTHLY", 
      reportDate 
    } = args;
    
    if (!vendorNumber) {
      throw new Error('Vendor number is required. Please provide it as an argument or set APP_STORE_CONNECT_VENDOR_NUMBER environment variable.');
    }
    
    validateRequired({ reportDate }, ['reportDate']);

    // Validate date format and ensure it's not in the future
    const datePattern = /^\d{4}-\d{2}$/;
    if (!datePattern.test(reportDate)) {
      throw new Error('Report date must be in YYYY-MM format (e.g., 2024-01)');
    }

    const [year, month] = reportDate.split('-').map(Number);
    const reportDateObj = new Date(year, month - 1);
    const currentDate = new Date();
    
    if (reportDateObj > currentDate) {
      throw new Error(`Cannot request sales report for future date: ${reportDate}. Sales reports are only available for past months.`);
    }

    const filters: SalesReportFilters = {
      reportDate,
      reportType,
      reportSubType,
      frequency,
      vendorNumber
    };

    console.error('downloadSalesReport: Calling downloadReport with filters:', buildFilterParams(filters));
    const result = await this.client.downloadReport('/salesReports', buildFilterParams(filters));
    console.error('downloadSalesReport: Result received, data length:', result?.data?.length);
    return result;
  }

  async downloadFinanceReport(args: {
    vendorNumber?: string;
    reportDate: string;
    regionCode: string;
  }): Promise<FinanceReportResponse> {
    const { vendorNumber = this.config?.vendorNumber, reportDate, regionCode } = args;
    
    if (!vendorNumber) {
      throw new Error('Vendor number is required. Please provide it as an argument or set APP_STORE_CONNECT_VENDOR_NUMBER environment variable.');
    }
    
    validateRequired({ reportDate, regionCode }, ['reportDate', 'regionCode']);

    // Validate date format and ensure it's not in the future
    const datePattern = /^\d{4}-\d{2}$/;
    if (!datePattern.test(reportDate)) {
      throw new Error('Report date must be in YYYY-MM format (e.g., 2024-01)');
    }

    const [year, month] = reportDate.split('-').map(Number);
    const reportDateObj = new Date(year, month - 1);
    const currentDate = new Date();
    
    if (reportDateObj > currentDate) {
      throw new Error(`Cannot request finance report for future date: ${reportDate}. Finance reports are only available for past months.`);
    }

    const filters: FinanceReportFilters = {
      reportDate,
      regionCode,
      vendorNumber
    };

    return this.client.downloadReport('/financeReports', buildFilterParams(filters));
  }
}