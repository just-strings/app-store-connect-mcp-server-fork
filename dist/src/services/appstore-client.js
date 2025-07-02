import axios from 'axios';
import { AuthService } from './auth.js';
import { gunzipSync } from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
export class AppStoreConnectClient {
    axiosInstance;
    authService;
    constructor(config) {
        this.authService = new AuthService(config);
        this.authService.validateConfig();
        this.axiosInstance = axios.create({
            baseURL: 'https://api.appstoreconnect.apple.com/v1',
        });
    }
    async request(method, url, data, params) {
        const token = await this.authService.generateToken();
        // For sales and finance reports, we need to handle binary/gzip responses
        const isReportEndpoint = url.includes('/salesReports') || url.includes('/financeReports');
        // Set up headers with proper Accept header for report endpoints
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        if (isReportEndpoint) {
            headers['Accept'] = 'application/a-gzip, application/json';
        }
        const response = await this.axiosInstance.request({
            method,
            url,
            data,
            params,
            headers,
            // For report endpoints, get raw buffer data
            responseType: isReportEndpoint ? 'arraybuffer' : 'json'
        });
        // Check if response is gzipped (for sales/finance reports)
        if (isReportEndpoint) {
            try {
                let buffer;
                // Handle different response data types
                if (response.data instanceof ArrayBuffer) {
                    buffer = Buffer.from(response.data);
                }
                else if (Buffer.isBuffer(response.data)) {
                    buffer = response.data;
                }
                else {
                    // If we get here, something unexpected happened
                    throw new Error(`Unexpected response data type: ${typeof response.data}`);
                }
                // Check for gzip magic number (1f 8b)
                if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
                    console.error('Detected gzip compressed data, using temp file approach...');
                    // Use timestamp and random number to ensure unique filenames
                    const timestamp = Date.now();
                    const random = Math.floor(Math.random() * 10000);
                    const tempDir = tmpdir();
                    const tempGzPath = path.join(tempDir, `apple_report_${timestamp}_${random}.gz`);
                    const tempTxtPath = path.join(tempDir, `apple_report_${timestamp}_${random}.txt`);
                    try {
                        // Write gzipped data to temp file
                        fs.writeFileSync(tempGzPath, buffer);
                        console.error(`Wrote ${buffer.length} bytes to temp gz file: ${tempGzPath}`);
                        // Decompress the data
                        const decompressed = gunzipSync(buffer);
                        console.error(`Decompressed to ${decompressed.length} bytes`);
                        // Write decompressed data to text file
                        fs.writeFileSync(tempTxtPath, decompressed, 'utf-8');
                        // Read back as UTF-8 text to ensure it's clean
                        const csvData = fs.readFileSync(tempTxtPath, 'utf-8');
                        console.error(`Read back ${csvData.length} characters of text data`);
                        // Validate the decompressed data is actually text
                        if (!csvData || csvData.includes('\0')) {
                            throw new Error('Decompressed data contains invalid characters');
                        }
                        // Log first 300 characters to verify it's readable
                        const preview = csvData.substring(0, 300).replace(/\t/g, ' | ').replace(/\r/g, '');
                        console.error('Report data preview:', preview);
                        // Clean up temp files
                        try {
                            fs.unlinkSync(tempGzPath);
                            fs.unlinkSync(tempTxtPath);
                            console.error('Cleaned up temp files');
                        }
                        catch (e) {
                            console.error('Warning: Could not clean up temp files:', e);
                        }
                        // Return in the expected format for reports
                        return { data: csvData };
                    }
                    catch (error) {
                        // Clean up temp files on error
                        try {
                            if (fs.existsSync(tempGzPath))
                                fs.unlinkSync(tempGzPath);
                            if (fs.existsSync(tempTxtPath))
                                fs.unlinkSync(tempTxtPath);
                        }
                        catch (e) {
                            // Ignore cleanup errors
                        }
                        console.error('Decompression error:', error);
                        throw new Error(`Failed to decompress report data: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                else {
                    // Not gzipped - might be an error response or already decompressed
                    const textData = buffer.toString('utf-8');
                    // Check if it looks like JSON (error response)
                    if (textData.trim().startsWith('{')) {
                        try {
                            const jsonData = JSON.parse(textData);
                            if (jsonData.errors) {
                                throw new Error(`API Error: ${JSON.stringify(jsonData.errors)}`);
                            }
                        }
                        catch (e) {
                            // Not JSON, continue as text
                        }
                    }
                    return { data: textData };
                }
            }
            catch (error) {
                console.error('Error processing report response:', error);
                throw error;
            }
        }
        return response.data;
    }
    async get(url, params) {
        return this.request('GET', url, undefined, params);
    }
    async post(url, data) {
        return this.request('POST', url, data);
    }
    async put(url, data) {
        return this.request('PUT', url, data);
    }
    async delete(url, data) {
        return this.request('DELETE', url, data);
    }
    async downloadFromUrl(url) {
        const token = await this.authService.generateToken();
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return {
            data: response.data,
            contentType: response.headers['content-type'],
            size: response.headers['content-length']
        };
    }
}
