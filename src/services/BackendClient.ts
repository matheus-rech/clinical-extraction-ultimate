/**
 * BackendClient
 * HTTP client for communicating with the la_consulta backend API
 * Handles authentication, token management, and API requests
 */

// Dynamically construct backend URL based on environment
let BACKEND_URL = import.meta.env.VITE_BACKEND_API_URL || '';

// Check if backend is explicitly disabled
const BACKEND_DISABLED = BACKEND_URL === 'disabled' || BACKEND_URL === 'none' || BACKEND_URL === '';

if (!BACKEND_DISABLED) {
  // If BACKEND_URL is localhost, convert it to the current Replit domain
  if (BACKEND_URL.includes('localhost')) {
    const currentHost = window.location.hostname;
    const protocol = window.location.protocol;
    // Replace localhost with current host, keep the port
    BACKEND_URL = BACKEND_URL.replace(/localhost/, currentHost);
  }

  // If no BACKEND_URL and we're not in localhost dev, use current domain with port 8080
  if (!BACKEND_URL) {
    const currentHost = window.location.hostname;
    const protocol = window.location.protocol;
    // In Replit, use the same domain with port 8080
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      BACKEND_URL = `${protocol}//${currentHost}:8080`;
    } else {
      // For local dev, use localhost:8080
      BACKEND_URL = `${protocol}//localhost:8080`;
    }
  }
} else {
  BACKEND_URL = '';
}

// Log the backend URL for debugging
console.log('🔧 Backend URL:', BACKEND_URL || '(using Vite proxy)');

interface AuthTokens {
  access_token: string;
  token_type: string;
}

class BackendClient {
  private accessToken: string | null = null;

  constructor() {
    this.loadTokenFromStorage();
  }

  private loadTokenFromStorage(): void {
    const token = localStorage.getItem('la_consulta_access_token');
    if (token) {
      this.accessToken = token;
    }
  }

  private saveTokenToStorage(token: string): void {
    localStorage.setItem('la_consulta_access_token', token);
    this.accessToken = token;
  }

  private clearTokenFromStorage(): void {
    localStorage.removeItem('la_consulta_access_token');
    this.accessToken = null;
  }

  async register(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorDetail = 'Registration failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    const tokens: AuthTokens = await response.json();
    this.saveTokenToStorage(tokens.access_token);
    return tokens;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorDetail = 'Login failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      const error = new Error(errorDetail);
      // Attach status code for better error handling
      (error as any).status = response.status;
      throw error;
    }

    const tokens: AuthTokens = await response.json();
    this.saveTokenToStorage(tokens.access_token);
    return tokens;
  }

  logout(): void {
    this.clearTokenFromStorage();
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async authenticatedRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please login first.');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      ...options.headers,
    };

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearTokenFromStorage();
      throw new Error('Session expired. Please login again.');
    }

    return response;
  }

  async generatePICO(documentId: string, pdfText: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/generate-pico', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, pdf_text: pdfText }),
    });

    if (!response.ok) {
      let errorDetail = 'PICO generation failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async generateSummary(documentId: string, pdfText: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/generate-summary', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, pdf_text: pdfText }),
    });

    if (!response.ok) {
      let errorDetail = 'Summary generation failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async validateField(documentId: string, fieldId: string, fieldValue: string, pdfText: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/validate-field', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        field_id: fieldId,
        field_value: fieldValue,
        pdf_text: pdfText,
      }),
    });

    if (!response.ok) {
      let errorDetail = 'Field validation failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async findMetadata(documentId: string, pdfText: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/find-metadata', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, pdf_text: pdfText }),
    });

    if (!response.ok) {
      let errorDetail = 'Metadata search failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async extractTables(documentId: string, pdfText: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/extract-tables', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, pdf_text: pdfText }),
    });

    if (!response.ok) {
      let errorDetail = 'Table extraction failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async analyzeImage(documentId: string, imageBase64: string, prompt: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/analyze-image', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        image_base64: imageBase64,
        prompt: prompt,
      }),
    });

    if (!response.ok) {
      let errorDetail = 'Image analysis failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async deepAnalysis(documentId: string, pdfText: string, prompt: string): Promise<any> {
    const response = await this.authenticatedRequest('/api/ai/deep-analysis', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        pdf_text: pdfText,
        prompt: prompt,
      }),
    });

    if (!response.ok) {
      let errorDetail = 'Deep analysis failed';
      try {
        const error = await response.json();
        errorDetail = error.detail || error.message || errorDetail;
      } catch {
        const text = await response.text().catch(() => '');
        errorDetail = text || errorDetail;
      }
      throw new Error(errorDetail);
    }

    return await response.json();
  }

  async uploadDocument(filename: string, pdfData: string, totalPages: number, metadata?: any): Promise<any> {
    const response = await this.authenticatedRequest('/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        filename,
        pdf_data: pdfData,
        total_pages: totalPages,
        metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Document upload failed');
    }

    return await response.json();
  }

  async getDocuments(): Promise<any[]> {
    const response = await this.authenticatedRequest('/api/documents', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch documents');
    }

    return await response.json();
  }

  async getDocument(documentId: string): Promise<any> {
    const response = await this.authenticatedRequest(`/api/documents/${documentId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch document');
    }

    return await response.json();
  }

  async deleteDocument(documentId: string): Promise<void> {
    const response = await this.authenticatedRequest(`/api/documents/${documentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete document');
    }
  }

  /**
   * Check if backend is available and healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      console.log(`🌐 Checking backend health at: ${BACKEND_URL}/api/health`);
      const response = await fetch(`${BACKEND_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      console.log(`📡 Health check response: status=${response.status}, ok=${response.ok}`);
      return response.ok;
    } catch (error) {
      console.error('❌ Health check failed:', {
        error: error instanceof Error ? error.message : String(error),
        backendUrl: BACKEND_URL
      });
      return false; // Backend not available
    }
  }

  /**
   * Get all PDFs in the library
   */
  async getLibraryPDFs(): Promise<any[]> {
    try {
      console.log('🔍 Fetching PDF library from backend...');
      const response = await this.authenticatedRequest('/api/pdf-library', {
        method: 'GET',
      });
      if (!response.ok) {
        let errorDetail = 'Failed to fetch library PDFs';
        try {
          const error = await response.json();
          errorDetail = error.detail || error.message || errorDetail;
        } catch {
          const text = await response.text().catch(() => '');
          errorDetail = text || errorDetail;
        }
        throw new Error(errorDetail);
      }
      const data = await response.json();
      console.log('✅ PDF library response:', data);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('❌ Failed to fetch PDF library:', error);
      throw error;
    }
  }

  /**
   * Get specific PDF from library with data
   */
  async getLibraryPDF(libraryId: string): Promise<any> {
    const response = await this.authenticatedRequest(`/api/pdf-library/${libraryId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch library PDF');
    }

    return await response.json();
  }
}

export const isBackendDisabled = () => BACKEND_DISABLED;
export default new BackendClient();