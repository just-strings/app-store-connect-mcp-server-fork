#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

import { AppStoreConnectConfig } from './types/index.js';
import { AppStoreConnectClient } from './services/index.js';
import { 
  AppHandlers, 
  BetaHandlers, 
  BundleHandlers, 
  DeviceHandlers, 
  UserHandlers, 
  AnalyticsHandlers,
  XcodeHandlers 
} from './handlers/index.js';

// Load environment variables
const config: AppStoreConnectConfig = {
  keyId: process.env.APP_STORE_CONNECT_KEY_ID!,
  issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID!,
  privateKeyPath: process.env.APP_STORE_CONNECT_P8_PATH!,
  vendorNumber: process.env.APP_STORE_CONNECT_VENDOR_NUMBER, // Optional for sales/finance reports
};

class AppStoreConnectServer {
  private server: Server;
  private client: AppStoreConnectClient;
  private appHandlers: AppHandlers;
  private betaHandlers: BetaHandlers;
  private bundleHandlers: BundleHandlers;
  private deviceHandlers: DeviceHandlers;
  private userHandlers: UserHandlers;
  private analyticsHandlers: AnalyticsHandlers;
  private xcodeHandlers: XcodeHandlers;

  constructor() {
    this.server = new Server({
      name: "appstore-connect-server",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.client = new AppStoreConnectClient(config);
    this.appHandlers = new AppHandlers(this.client);
    this.betaHandlers = new BetaHandlers(this.client);
    this.bundleHandlers = new BundleHandlers(this.client);
    this.deviceHandlers = new DeviceHandlers(this.client);
    this.userHandlers = new UserHandlers(this.client);
    this.analyticsHandlers = new AnalyticsHandlers(this.client, config);
    this.xcodeHandlers = new XcodeHandlers();

    this.setupHandlers();
  }

  private buildToolsList() {
    const baseTools = [
        // App Management Tools
        {
          name: "list_apps",
          description: "Get a list of all apps in App Store Connect",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of apps to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            }
          }
        },
        {
          name: "get_app_info",
          description: "Get detailed information about a specific app",
          inputSchema: {
            type: "object", 
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app to get information for"
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "appClips", "appInfos", "appStoreVersions", "availableTerritories",
                    "betaAppReviewDetail", "betaGroups", "betaLicenseAgreement", "builds",
                    "endUserLicenseAgreement", "gameCenterEnabledVersions", "inAppPurchases",
                    "preOrder", "prices", "reviewSubmissions"
                  ]
                },
                description: "Optional relationships to include in the response"
              }
            },
            required: ["appId"]
          }
        },

        // Beta Testing Tools
        {
          name: "list_beta_groups",
          description: "Get a list of all beta groups (internal and external)",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of groups to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            }
          }
        },
        {
          name: "list_group_testers",
          description: "Get a list of all testers in a specific beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              limit: {
                type: "number",
                description: "Maximum number of testers to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["groupId"]
          }
        },
        {
          name: "add_tester_to_group",
          description: "Add a new tester to a beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              email: {
                type: "string",
                description: "Email address of the tester"
              },
              firstName: {
                type: "string",
                description: "First name of the tester"
              },
              lastName: {
                type: "string",
                description: "Last name of the tester"
              }
            },
            required: ["groupId", "email", "firstName", "lastName"]
          }
        },
        {
          name: "remove_tester_from_group",
          description: "Remove a tester from a beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              testerId: {
                type: "string",
                description: "The ID of the beta tester"
              }
            },
            required: ["groupId", "testerId"]
          }
        },

        // Bundle ID Tools
        {
          name: "create_bundle_id",
          description: "Register a new bundle ID for app development",
          inputSchema: {
            type: "object",
            properties: {
              identifier: {
                type: "string",
                description: "The bundle ID string (e.g., 'com.example.app')"
              },
              name: {
                type: "string",
                description: "A name for the bundle ID"
              },
              platform: {
                type: "string",
                enum: ["IOS", "MAC_OS", "UNIVERSAL"],
                description: "The platform for this bundle ID"
              },
              seedId: {
                type: "string",
                description: "Your team's seed ID (optional)"
              }
            },
            required: ["identifier", "name", "platform"]
          }
        },
        {
          name: "list_bundle_ids",
          description: "Find and list bundle IDs that are registered to your team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of bundle IDs to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: [
                  "name", "-name", "platform", "-platform", 
                  "identifier", "-identifier", "seedId", "-seedId", "id", "-id"
                ]
              },
              filter: {
                type: "object",
                properties: {
                  identifier: { type: "string", description: "Filter by bundle identifier" },
                  name: { type: "string", description: "Filter by name" },
                  platform: { 
                    type: "string", 
                    description: "Filter by platform",
                    enum: ["IOS", "MAC_OS", "UNIVERSAL"]
                  },
                  seedId: { type: "string", description: "Filter by seed ID" }
                }
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["profiles", "bundleIdCapabilities", "app"]
                },
                description: "Related resources to include in the response"
              }
            }
          }
        },
        {
          name: "get_bundle_id_info",
          description: "Get detailed information about a specific bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              bundleIdId: {
                type: "string",
                description: "The ID of the bundle ID to get information for"
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["profiles", "bundleIdCapabilities", "app"]
                },
                description: "Optional relationships to include in the response"
              },
              fields: {
                type: "object",
                properties: {
                  bundleIds: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["name", "platform", "identifier", "seedId"]
                    },
                    description: "Fields to include for the bundle ID"
                  }
                },
                description: "Specific fields to include in the response"
              }
            },
            required: ["bundleIdId"]
          }
        },
        {
          name: "enable_bundle_capability",
          description: "Enable a capability for a bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              bundleIdId: {
                type: "string",
                description: "The ID of the bundle ID"
              },
              capabilityType: {
                type: "string",
                description: "The type of capability to enable",
                enum: [
                  "ICLOUD", "IN_APP_PURCHASE", "GAME_CENTER", "PUSH_NOTIFICATIONS", "WALLET",
                  "INTER_APP_AUDIO", "MAPS", "ASSOCIATED_DOMAINS", "PERSONAL_VPN", "APP_GROUPS",
                  "HEALTHKIT", "HOMEKIT", "WIRELESS_ACCESSORY_CONFIGURATION", "APPLE_PAY",
                  "DATA_PROTECTION", "SIRIKIT", "NETWORK_EXTENSIONS", "MULTIPATH", "HOT_SPOT",
                  "NFC_TAG_READING", "CLASSKIT", "AUTOFILL_CREDENTIAL_PROVIDER", "ACCESS_WIFI_INFORMATION",
                  "NETWORK_CUSTOM_PROTOCOL", "COREMEDIA_HLS_LOW_LATENCY", "SYSTEM_EXTENSION_INSTALL",
                  "USER_MANAGEMENT", "APPLE_ID_AUTH"
                ]
              },
              settings: {
                type: "array",
                description: "Optional capability settings",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string", description: "The setting key" },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string" },
                          enabled: { type: "boolean" }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ["bundleIdId", "capabilityType"]
          }
        },
        {
          name: "disable_bundle_capability",
          description: "Disable a capability for a bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              capabilityId: {
                type: "string",
                description: "The ID of the capability to disable"
              }
            },
            required: ["capabilityId"]
          }
        },

        // Device Management Tools
        {
          name: "list_devices",
          description: "Get a list of all devices registered to your team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of devices to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: [
                  "name", "-name", "platform", "-platform", "status", "-status",
                  "udid", "-udid", "deviceClass", "-deviceClass", "model", "-model",
                  "addedDate", "-addedDate"
                ]
              },
              filter: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Filter by device name" },
                  platform: { 
                    type: "string", 
                    description: "Filter by platform",
                    enum: ["IOS", "MAC_OS"]
                  },
                  status: { 
                    type: "string", 
                    description: "Filter by status",
                    enum: ["ENABLED", "DISABLED"]
                  },
                  udid: { type: "string", description: "Filter by device UDID" },
                  deviceClass: { 
                    type: "string", 
                    description: "Filter by device class",
                    enum: ["APPLE_WATCH", "IPAD", "IPHONE", "IPOD", "APPLE_TV", "MAC"]
                  }
                }
              },
              fields: {
                type: "object",
                properties: {
                  devices: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["name", "platform", "udid", "deviceClass", "status", "model", "addedDate"]
                    },
                    description: "Fields to include for each device"
                  }
                }
              }
            }
          }
        },

        // User Management Tools
        {
          name: "list_users",
          description: "Get a list of all users registered on your App Store Connect team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of users to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: ["username", "-username", "firstName", "-firstName", "lastName", "-lastName", "roles", "-roles"]
              },
              filter: {
                type: "object",
                properties: {
                  username: { type: "string", description: "Filter by username" },
                  roles: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "ADMIN", "FINANCE", "TECHNICAL", "SALES", "MARKETING", "DEVELOPER",
                        "ACCOUNT_HOLDER", "READ_ONLY", "APP_MANAGER", "ACCESS_TO_REPORTS", "CUSTOMER_SUPPORT"
                      ]
                    },
                    description: "Filter by user roles"
                  },
                  visibleApps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter by apps the user can see (app IDs)"
                  }
                }
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["visibleApps"]
                },
                description: "Related resources to include in the response"
              }
            }
          }
        },

        // Analytics & Reports Tools
        {
          name: "create_analytics_report_request",
          description: "Create a new analytics report request for an app",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app to generate analytics reports for"
              },
              accessType: {
                type: "string",
                enum: ["ONGOING", "ONE_TIME_SNAPSHOT"],
                description: "Access type for the analytics report (ONGOING for daily data, ONE_TIME_SNAPSHOT for historical data)",
                default: "ONE_TIME_SNAPSHOT"
              }
            },
            required: ["appId"]
          }
        },
        {
          name: "list_analytics_reports",
          description: "Get available analytics reports for a specific report request",
          inputSchema: {
            type: "object",
            properties: {
              reportRequestId: {
                type: "string",
                description: "The ID of the analytics report request"
              },
              limit: {
                type: "number",
                description: "Maximum number of reports to return (default: 100)",
                minimum: 1,
                maximum: 200
              },
              filter: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["APP_STORE_ENGAGEMENT", "APP_STORE_COMMERCE", "APP_USAGE", "FRAMEWORKS_USAGE", "PERFORMANCE"],
                    description: "Filter by report category"
                  }
                }
              }
            },
            required: ["reportRequestId"]
          }
        },
        {
          name: "list_analytics_report_segments",
          description: "Get segments for a specific analytics report (contains download URLs)",
          inputSchema: {
            type: "object",
            properties: {
              reportId: {
                type: "string",
                description: "The ID of the analytics report"
              },
              limit: {
                type: "number",
                description: "Maximum number of segments to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["reportId"]
          }
        },
        {
          name: "download_analytics_report_segment",
          description: "Download data from an analytics report segment URL",
          inputSchema: {
            type: "object",
            properties: {
              segmentUrl: {
                type: "string",
                description: "The URL of the analytics report segment to download"
              }
            },
            required: ["segmentUrl"]
          }
        },

        // Xcode Development Tools
        {
          name: "list_schemes",
          description: "List all available schemes in an Xcode project or workspace",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)"
              }
            },
            required: ["projectPath"]
          }
        }
    ];

    // Sales and Finance Report tools - only available if vendor number is configured
    const paymentReportTools = [
      {
        name: "download_sales_report",
        description: "Download sales and trends reports",
        inputSchema: {
          type: "object",
          properties: {
            vendorNumber: {
              type: "string",
              description: "Your vendor number from App Store Connect (optional if set as environment variable)",
              default: config.vendorNumber
            },
            reportType: {
              type: "string",
              enum: ["SALES"],
              description: "Type of report to download",
              default: "SALES"
            },
            reportSubType: {
              type: "string",
              enum: ["SUMMARY", "DETAILED"],
              description: "Sub-type of the report",
              default: "SUMMARY"
            },
            frequency: {
              type: "string",
              enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
              description: "Frequency of the report",
              default: "MONTHLY"
            },
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM format (e.g., '2024-01')"
            }
          },
          required: ["reportDate"]
        }
      },
      {
        name: "download_finance_report",
        description: "Download finance reports for a specific region",
        inputSchema: {
          type: "object",
          properties: {
            vendorNumber: {
              type: "string",
              description: "Your vendor number from App Store Connect (optional if set as environment variable)",
              default: config.vendorNumber
            },
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM format (e.g., '2024-01')"
            },
            regionCode: {
              type: "string",
              description: "Region code (e.g., 'Z1' for worldwide, 'WW' for Europe)"
            }
          },
          required: ["reportDate", "regionCode"]
        }
      }
    ];

    // Only include payment report tools if vendor number is configured
    if (config.vendorNumber) {
      return [...baseTools, ...paymentReportTools];
    }

    return baseTools;
  }

  private formatToolResponse(result: any, error?: Error): any {
    if (error) {
      let errorMessage = error.message;
      
      // Check if it's an axios error with specific status codes
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const apiError = error.response?.data?.errors?.[0];
        
        if (status === 404) {
          // Provide more specific messages for 404 errors
          if (error.config?.url?.includes('/salesReports')) {
            errorMessage = 'Sales report not found. This typically happens when:\n' +
              '- The requested date is in the future\n' +
              '- No sales data exists for the requested period\n' +
              '- The report hasn\'t been generated yet (reports are usually available 1-2 days after the period ends)';
          } else if (error.config?.url?.includes('/financeReports')) {
            errorMessage = 'Finance report not found. This typically happens when:\n' +
              '- The requested date is in the future\n' +
              '- No financial data exists for the requested period\n' +
              '- The report hasn\'t been generated yet (finance reports are usually available after the 5th of the following month)';
          } else {
            errorMessage = apiError?.detail || `Resource not found (404): ${error.config?.url}`;
          }
        } else if (status === 400) {
          // Provide more specific messages for 400 errors
          if (error.config?.url?.includes('/apps/') && error.config?.params?.include) {
            errorMessage = 'Bad request: Invalid relationship includes. ' +
              'Common issues:\n' +
              '- Using "customerReviews" instead of "reviewSubmissions"\n' +
              '- Using "perfPowerMetrics" which is not a valid relationship\n' +
              '- Check that all include values match the API documentation exactly';
          } else {
            errorMessage = apiError?.detail || 'Bad request: The request parameters are invalid. Check that all values match the API requirements.';
          }
        } else if (apiError) {
          errorMessage = `App Store Connect API error: ${apiError.detail || apiError.title || error.message}`;
        } else {
          errorMessage = `Request failed with status ${status}: ${error.message}`;
        }
      }
      
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorMessage
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: typeof result === 'string' ? result : JSON.stringify(result)
        }
      ]
    };
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.buildToolsList()
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments || {};
        
        switch (request.params.name) {
          // App Management
          case "list_apps":
            try {
              const result = await this.appHandlers.listApps(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "get_app_info":
            try {
              const result = await this.appHandlers.getAppInfo(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Beta Testing
          case "list_beta_groups":
            try {
              const result = await this.betaHandlers.listBetaGroups(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "list_group_testers":
            try {
              const result = await this.betaHandlers.listGroupTesters(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "add_tester_to_group":
            try {
              const result = await this.betaHandlers.addTesterToGroup(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "remove_tester_from_group":
            try {
              const result = await this.betaHandlers.removeTesterFromGroup(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Bundle IDs
          case "create_bundle_id":
            try {
              const result = await this.bundleHandlers.createBundleId(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "list_bundle_ids":
            try {
              const result = await this.bundleHandlers.listBundleIds(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "get_bundle_id_info":
            try {
              const result = await this.bundleHandlers.getBundleIdInfo(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "enable_bundle_capability":
            try {
              const result = await this.bundleHandlers.enableBundleCapability(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "disable_bundle_capability":
            try {
              const result = await this.bundleHandlers.disableBundleCapability(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Devices
          case "list_devices":
            try {
              const result = await this.deviceHandlers.listDevices(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Users
          case "list_users":
            try {
              const result = await this.userHandlers.listUsers(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Analytics & Reports
          case "create_analytics_report_request":
            try {
              const result = await this.analyticsHandlers.createAnalyticsReportRequest(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "list_analytics_reports":
            try {
              const result = await this.analyticsHandlers.listAnalyticsReports(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "list_analytics_report_segments":
            try {
              const result = await this.analyticsHandlers.listAnalyticsReportSegments(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "download_analytics_report_segment":
            try {
              const result = await this.analyticsHandlers.downloadAnalyticsReportSegment(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "download_sales_report":
            try {
              if (!config.vendorNumber) {
                throw new McpError(
                  ErrorCode.MethodNotFound,
                  "Sales reports are not available. Please set APP_STORE_CONNECT_VENDOR_NUMBER environment variable."
                );
              }
              const result = await this.analyticsHandlers.downloadSalesReport(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }
          
          case "download_finance_report":
            try {
              if (!config.vendorNumber) {
                throw new McpError(
                  ErrorCode.MethodNotFound,
                  "Finance reports are not available. Please set APP_STORE_CONNECT_VENDOR_NUMBER environment variable."
                );
              }
              const result = await this.analyticsHandlers.downloadFinanceReport(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          // Xcode Development Tools
          case "list_schemes":
            try {
              const result = await this.xcodeHandlers.listSchemes(args as any);
              return this.formatToolResponse(result);
            } catch (error) {
              return this.formatToolResponse(null, error as Error);
            }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new McpError(
            ErrorCode.InternalError,
            `App Store Connect API error: ${error.response?.data?.errors?.[0]?.detail ?? error.message}`
          );
        }
        throw error;
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("App Store Connect MCP server running on stdio");
  }
}

// Start the server
const server = new AppStoreConnectServer();
server.run().catch(console.error);