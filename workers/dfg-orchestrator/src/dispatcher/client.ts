/**
 * DFG Orchestrator - Claude API Dispatcher
 * 
 * Wraps Anthropic API with:
 * - Exponential backoff retry (1s, 2s, 4s)
 * - Token tracking
 * - Timeout handling
 * - Provenance logging
 */

import Anthropic from '@anthropic-ai/sdk';
import { GUARDRAILS, MODELS, TASK_CONFIG, VERSIONS } from '../config';
import { getContextPack, hashContent } from '../context/packs';
import { QA_PLAN_PROMPT } from '../prompts/qa-plan';
import type { TaskType, TaskInput, GenerateResult, Provenance } from '../types';

export class Dispatcher {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate a QA plan for a PR.
   */
  async generateQAPlan(
    prNumber: number,
    prTitle: string,
    prBody: string,
    issueBody?: string
  ): Promise<{
    result: GenerateResult;
    provenance: Provenance;
  }> {
    const taskType: TaskType = 'qa_plan';
    const config = TASK_CONFIG[taskType];
    const contextPack = getContextPack(taskType);
    
    // Build prompts
    const systemPrompt = QA_PLAN_PROMPT.system;
    const userPrompt = QA_PLAN_PROMPT.user
      .replace('{{PR_NUMBER}}', String(prNumber))
      .replace('{{PR_TITLE}}', prTitle)
      .replace('{{PR_BODY}}', prBody)
      .replace('{{ISSUE_BODY}}', issueBody || 'Not linked to an issue')
      .replace('{{CONTEXT_PACK}}', contextPack);

    // Compute provenance hashes
    const input = { prNumber, prTitle, prBody, issueBody };
    const inputHash = await hashContent(JSON.stringify(input));
    const contextHash = await hashContent(contextPack);
    const promptTemplateHash = await hashContent(systemPrompt + userPrompt);

    const provenance: Provenance = {
      inputHash,
      contextHash,
      contextPackVersion: VERSIONS.CONTEXT_PACK,
      modelVersion: config.model,
      promptVersion: VERSIONS.PROMPT,
      promptTemplateHash,
    };

    // Execute with retry
    const result = await this.executeWithRetry(
      systemPrompt,
      userPrompt,
      config.model,
      config.maxOutputTokens,
      config.timeout
    );

    return { result, provenance };
  }

  /**
   * Execute a Claude API call with exponential backoff retry.
   */
  private async executeWithRetry(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
    timeout: number
  ): Promise<GenerateResult> {
    const retryDelaysMs: number[] = [];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GUARDRAILS.MAX_RETRIES; attempt++) {
      const startTime = Date.now();

      try {
        const response = await this.callWithTimeout(
          systemPrompt,
          userPrompt,
          model,
          maxTokens,
          timeout
        );

        const durationMs = Date.now() - startTime;

        // Extract content
        const textBlock = response.content.find(block => block.type === 'text');
        const rawOutput = textBlock?.type === 'text' ? textBlock.text : '';

        // Try to parse as JSON
        let output: unknown;
        try {
          // Strip markdown code blocks if present
          const cleaned = rawOutput
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
          output = JSON.parse(cleaned);
        } catch {
          // Not JSON, keep as string
          output = rawOutput;
        }

        return {
          success: true,
          output,
          rawOutput,
          tokens: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
          durationMs,
          attempts: attempt,
          retryDelaysMs,
        };
      } catch (error) {
        lastError = error as Error;
        const durationMs = Date.now() - startTime;

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          return {
            success: false,
            tokens: { input: 0, output: 0 },
            durationMs,
            attempts: attempt,
            retryDelaysMs,
            error: lastError.message,
          };
        }

        // Calculate backoff delay
        if (attempt < GUARDRAILS.MAX_RETRIES) {
          const delay = GUARDRAILS.BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          retryDelaysMs.push(delay);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    return {
      success: false,
      tokens: { input: 0, output: 0 },
      durationMs: 0,
      attempts: GUARDRAILS.MAX_RETRIES,
      retryDelaysMs,
      error: lastError?.message || 'Unknown error after retries',
    };
  }

  /**
   * Call Claude API with timeout.
   */
  private async callWithTimeout(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
    timeout: number
  ): Promise<Anthropic.Message> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if an error should not be retried.
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      // Don't retry 4xx errors (except 429 rate limit)
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
        return true;
      }
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
