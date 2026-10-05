import { OllamaModel } from '@yagolopez/adk-utils'

export type ResolvedModel = string | InstanceType<typeof OllamaModel>

/**
 * Model for @google/adk LlmAgent.
 *
 * - `ARTEMIS_LLM_PROVIDER=gemini` — use `GEMINI_MODEL` as a Google Gemini model id (default when OLLAMA_API_BASE is unset).
 * - `ARTEMIS_LLM_PROVIDER=ollama` — use Ollama (cloud/local) via @yagolopez/adk-utils; requires `OLLAMA_API_BASE` (see ADK Ollama docs).
 * - `ARTEMIS_LLM_PROVIDER=auto` (default) — if `OLLAMA_API_BASE` is set, use Ollama; else Gemini.
 *
 * From Docker, point Ollama on the host at `http://host.docker.internal:11434` (Linux: add `extra_hosts`).
 */
export function getModel(): ResolvedModel {
  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro'
  const provider = (process.env.ARTEMIS_LLM_PROVIDER ?? 'auto').toLowerCase()
  const ollamaBaseUrl = process.env.OLLAMA_API_BASE?.trim()

  if (provider === 'gemini') {
    return modelName
  }

  if (provider === 'ollama') {
    if (!ollamaBaseUrl) {
      throw new Error(
        'ARTEMIS_LLM_PROVIDER=ollama requires OLLAMA_API_BASE (e.g. http://localhost:11434 or http://host.docker.internal:11434 in Docker).',
      )
    }
    return new OllamaModel(modelName, ollamaBaseUrl)
  }

  if (ollamaBaseUrl) {
    return new OllamaModel(modelName, ollamaBaseUrl)
  }

  return modelName
}
