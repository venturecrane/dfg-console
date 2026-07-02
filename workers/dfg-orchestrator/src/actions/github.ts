/**
 * DFG Orchestrator - GitHub Actions
 * 
 * Executes actions via dfg-relay.
 * Only policy-approved actions can reach this layer.
 */

import { GITHUB } from '../config';

export interface GitHubActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class GitHubActions {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = GITHUB.RELAY_BASE_URL;
  }

  /**
   * Add a comment to an issue or PR.
   */
  async addComment(issueNumber: number, body: string): Promise<GitHubActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/comment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issue: issueNumber,
          body,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Relay error ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Update labels on an issue.
   * Note: Only used in Phase 1+ with Captain approval.
   */
  async updateLabels(
    issueNumber: number,
    add: string[],
    remove: string[]
  ): Promise<GitHubActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issue: issueNumber,
          add,
          remove,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Relay error ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch PR details from GitHub API (via relay or direct).
   */
  async fetchPR(prNumber: number): Promise<{
    success: boolean;
    data?: {
      title: string;
      body: string;
      head_sha: string;
      labels: string[];
    };
    error?: string;
  }> {
    // For Phase 0, we'll use the GitHub API directly
    // In production, this should go through a relay endpoint
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB.OWNER}/${GITHUB.REPO}/pulls/${prNumber}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'dfg-orchestrator',
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `GitHub API error ${response.status}`,
        };
      }

      const pr = await response.json() as {
        title: string;
        body: string | null;
        head?: { sha?: string };
        labels?: Array<{ name: string }>;
      };
      return {
        success: true,
        data: {
          title: pr.title,
          body: pr.body || '',
          head_sha: pr.head?.sha || '',
          labels: (pr.labels || []).map((l) => l.name),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch issue details from GitHub API.
   */
  async fetchIssue(issueNumber: number): Promise<{
    success: boolean;
    data?: {
      title: string;
      body: string;
      labels: string[];
    };
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB.OWNER}/${GITHUB.REPO}/issues/${issueNumber}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'dfg-orchestrator',
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `GitHub API error ${response.status}`,
        };
      }

      const issue = await response.json() as {
        title: string;
        body: string | null;
        labels?: Array<{ name: string }>;
      };
      return {
        success: true,
        data: {
          title: issue.title,
          body: issue.body || '',
          labels: (issue.labels || []).map((l) => l.name),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${(error as Error).message}`,
      };
    }
  }
}
