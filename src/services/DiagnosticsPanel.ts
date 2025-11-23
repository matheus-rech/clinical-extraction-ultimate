/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DiagnosticsPanel Service
 * Provides real-time system health monitoring and diagnostics
 * Checks: Backend API, Auth Service, PDF Engine, LocalStorage
 */

import BackendClient from './BackendClient';
import AuthManager from './AuthManager';

type SystemStatus = 'pending' | 'ok' | 'error' | 'ready' | 'authenticated' | 'guest';

interface SystemHealthState {
  backend: SystemStatus;
  auth: SystemStatus;
  pdfEngine: SystemStatus;
  localStorage: SystemStatus;
}

class DiagnosticsPanel {
  private container: HTMLDivElement | null = null;
  private isVisible: boolean = true;
  private logs: string[] = [];
  
  private status: SystemHealthState = {
    backend: 'pending',
    auth: 'pending',
    pdfEngine: 'pending',
    localStorage: 'pending'
  };

  /**
   * Initialize the diagnostics panel
   */
  initialize(): void {
    this.createUI();
    this.checkSystem();
  }

  /**
   * Add a log entry with timestamp
   */
  private addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.push(`[${timestamp}] ${message}`);
    this.updateLogsDisplay();
  }

  /**
   * Create the UI elements for the diagnostics panel
   */
  private createUI(): void {
    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'diagnostics-panel';
    this.container.className = 'diagnostics-panel';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 384px;
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      font-family: monospace;
      font-size: 14px;
      z-index: 9999;
      overflow: hidden;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      background: #1f2937;
      color: white;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <h3 style="margin: 0; font-weight: bold; font-size: 14px;">System Health</h3>
      <button id="diagnostics-close-btn" style="
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
      ">×</button>
    `;

    // Create status indicators grid
    const statusGrid = document.createElement('div');
    statusGrid.id = 'diagnostics-status-grid';
    statusGrid.style.cssText = `
      padding: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      border-bottom: 1px solid #e5e7eb;
    `;

    // Create logs container
    const logsContainer = document.createElement('div');
    logsContainer.id = 'diagnostics-logs';
    logsContainer.style.cssText = `
      height: 192px;
      overflow-y: auto;
      padding: 8px;
      background: #f9fafb;
    `;

    // Create footer with rerun button
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px;
      background: #f3f4f6;
      text-align: center;
    `;
    footer.innerHTML = `
      <button id="diagnostics-rerun-btn" style="
        padding: 4px 16px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">Rerun Tests</button>
    `;

    // Assemble the panel
    this.container.appendChild(header);
    this.container.appendChild(statusGrid);
    this.container.appendChild(logsContainer);
    this.container.appendChild(footer);

    // Add to body
    document.body.appendChild(this.container);

    // Add event listeners
    const closeBtn = document.getElementById('diagnostics-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
      closeBtn.addEventListener('mouseenter', (e) => {
        (e.target as HTMLElement).style.color = 'white';
      });
      closeBtn.addEventListener('mouseleave', (e) => {
        (e.target as HTMLElement).style.color = '#9ca3af';
      });
    }

    const rerunBtn = document.getElementById('diagnostics-rerun-btn');
    if (rerunBtn) {
      rerunBtn.addEventListener('click', () => this.checkSystem());
      rerunBtn.addEventListener('mouseenter', (e) => {
        (e.target as HTMLElement).style.background = '#1d4ed8';
      });
      rerunBtn.addEventListener('mouseleave', (e) => {
        (e.target as HTMLElement).style.background = '#2563eb';
      });
    }

    // Initialize status indicators
    this.updateStatusDisplay();
  }

  /**
   * Create a toggle button to show the panel when hidden
   */
  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'diagnostics-toggle-btn';
    btn.textContent = 'Show Diagnostics';
    btn.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: #1f2937;
      color: white;
      padding: 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      z-index: 9998;
      font-size: 12px;
    `;
    btn.addEventListener('click', () => this.show());
    btn.addEventListener('mouseenter', (e) => {
      (e.target as HTMLElement).style.background = '#374151';
    });
    btn.addEventListener('mouseleave', (e) => {
      (e.target as HTMLElement).style.background = '#1f2937';
    });
    return btn;
  }

  /**
   * Show the diagnostics panel
   */
  private show(): void {
    this.isVisible = true;
    if (this.container) {
      this.container.style.display = 'block';
    }
    const toggleBtn = document.getElementById('diagnostics-toggle-btn');
    if (toggleBtn) {
      toggleBtn.remove();
    }
  }

  /**
   * Hide the diagnostics panel
   */
  private hide(): void {
    this.isVisible = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
    const existingBtn = document.getElementById('diagnostics-toggle-btn');
    if (!existingBtn) {
      document.body.appendChild(this.createToggleButton());
    }
  }

  /**
   * Update the status indicators display
   */
  private updateStatusDisplay(): void {
    const statusGrid = document.getElementById('diagnostics-status-grid');
    if (!statusGrid) return;

    const indicators = [
      { label: 'Backend API', status: this.status.backend },
      { label: 'Auth Service', status: this.status.auth },
      { label: 'PDF Engine', status: this.status.pdfEngine },
      { label: 'Storage', status: this.status.localStorage }
    ];

    statusGrid.innerHTML = indicators.map(({ label, status }) => {
      const color = this.getStatusColor(status);
      return `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="color: #4b5563;">${label}</span>
          <div style="
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${color};
          "></div>
        </div>
      `;
    }).join('');
  }

  /**
   * Get color for status indicator
   */
  private getStatusColor(status: SystemStatus): string {
    const colors: Record<SystemStatus, string> = {
      pending: '#fbbf24',
      ok: '#10b981',
      ready: '#10b981',
      authenticated: '#10b981',
      guest: '#60a5fa',
      error: '#ef4444'
    };
    return colors[status] || '#9ca3af';
  }

  /**
   * Update the logs display
   */
  private updateLogsDisplay(): void {
    const logsContainer = document.getElementById('diagnostics-logs');
    if (!logsContainer) return;

    logsContainer.innerHTML = this.logs.map(log => `
      <div style="
        font-size: 12px;
        color: #4b5563;
        margin-bottom: 4px;
        border-bottom: 1px solid #f3f4f6;
        padding-bottom: 4px;
      ">${log}</div>
    `).join('');

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  /**
   * Run all system checks
   */
  async checkSystem(): Promise<void> {
    this.logs = []; // Clear previous logs
    this.addLog("Starting System Diagnostics...");

    // 1. Check Local Storage
    await this.checkLocalStorage();

    // 2. Check PDF Engine
    await this.checkPDFEngine();

    // 3. Check Backend Connectivity
    await this.checkBackend();

    // 4. Check Auth
    await this.checkAuth();

    this.addLog("✅ System diagnostics complete");
  }

  /**
   * Check if localStorage is accessible
   */
  private async checkLocalStorage(): Promise<void> {
    try {
      localStorage.setItem('diag_test', 'ok');
      localStorage.removeItem('diag_test');
      this.status.localStorage = 'ok';
      this.addLog("✅ LocalStorage is writable");
    } catch (e) {
      this.status.localStorage = 'error';
      this.addLog("❌ LocalStorage error");
    }
    this.updateStatusDisplay();
  }

  /**
   * Check if PDF.js engine is available
   */
  private async checkPDFEngine(): Promise<void> {
    try {
      if ((window as any).pdfjsLib) {
        this.status.pdfEngine = 'ready';
        const version = (window as any).pdfjsLib.version || 'unknown';
        this.addLog(`✅ PDF.js Library Version: ${version}`);
      } else {
        throw new Error("PDF Lib not found");
      }
    } catch (e) {
      this.status.pdfEngine = 'error';
      this.addLog("❌ PDF Engine missing");
    }
    this.updateStatusDisplay();
  }

  /**
   * Check backend connectivity
   */
  private async checkBackend(): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8080';
      this.addLog(`📡 Pinging Backend at: ${apiUrl}`);
      
      const isHealthy = await BackendClient.healthCheck();
      if (isHealthy) {
        this.status.backend = 'ok';
        this.addLog("✅ Backend Connection Established");
      } else {
        throw new Error('Health check failed');
      }
    } catch (e: any) {
      this.status.backend = 'error';
      this.addLog(`ℹ️ Backend not available - using direct Gemini API (frontend-only mode)`);
    }
    this.updateStatusDisplay();
  }

  /**
   * Check authentication status
   */
  private async checkAuth(): Promise<void> {
    try {
      const isAuthenticated = BackendClient.isAuthenticated();
      if (isAuthenticated) {
        this.status.auth = 'authenticated';
        this.addLog("👤 User Authenticated");
      } else {
        this.status.auth = 'guest';
        this.addLog("👤 Guest Mode (No active session)");
      }
    } catch (e) {
      this.status.auth = 'error';
      this.addLog("❌ Auth Service Error");
    }
    this.updateStatusDisplay();
  }

  /**
   * Clean up the diagnostics panel
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    const toggleBtn = document.getElementById('diagnostics-toggle-btn');
    if (toggleBtn) {
      toggleBtn.remove();
    }
  }
}

// Export singleton instance
export default new DiagnosticsPanel();
