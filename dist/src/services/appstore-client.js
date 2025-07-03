import axios from 'axios';
import { gunzipSync } from 'zlib';
import { AuthService } from './auth.js';
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
        const response = await this.axiosInstance.request({
            method,
            url,
            data,
            params,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
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
    async downloadReport(url, params) {
        const token = await this.authService.generateToken();
        console.error(`downloadReport called for: ${url}`);
        console.error(`Parameters:`, params);
        try {
            // Use a separate axios call with binary response type
            const response = await axios.get(url, {
                baseURL: 'https://api.appstoreconnect.apple.com/v1',
                params,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/a-gzip'
                },
                responseType: 'arraybuffer'
            });
            console.error(`Response status: ${response.status}`);
            console.error(`Response headers:`, response.headers);
            const buffer = Buffer.from(response.data);
            console.error(`Response buffer size: ${buffer.length} bytes`);
            // Check for gzip magic number (0x1f 0x8b)
            const isGzipped = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
            console.error(`Is gzipped: ${isGzipped}`);
            if (isGzipped) {
                console.error(`First 10 bytes of buffer:`, buffer.slice(0, 10));
                const decompressed = gunzipSync(buffer);
                const csvData = decompressed.toString('utf-8');
                console.error(`Decompressed report: ${csvData.length} characters`);
                console.error(`First 100 chars of CSV:`, csvData.substring(0, 100));
                return { data: csvData };
            }
            // If not gzipped, just convert to string
            console.error('Data is not gzipped, converting directly to string');
            const textData = buffer.toString('utf-8');
            console.error(`Text data length: ${textData.length} characters`);
            console.error(`First 100 chars:`, textData.substring(0, 100));
            return { data: textData };
        }
        catch (error) {
            console.error('Error downloading report:', error);
            if (axios.isAxiosError(error)) {
                console.error('Axios error details:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });
            }
            throw error;
        }
    }
}
