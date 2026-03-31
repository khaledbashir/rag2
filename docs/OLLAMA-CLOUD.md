# Ollama Cloud Models — ANC Reference

> API Key: `6b6342c108094603892c627b2e25fb23.yhHhquTdzFKyD0dUEE7ewVj6`
> Endpoint: `https://ollama.com/api`
> Auth: `Authorization: Bearer <key>`

---

## Quick Usage

```bash
# Chat
curl https://ollama.com/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -d '{"model": "kimi-k2.5", "messages": [{"role": "user", "content": "Hello"}], "stream": false}'

# With vision (image)
curl https://ollama.com/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -d '{"model": "qwen3-vl:235b-instruct", "messages": [{"role": "user", "content": "What is in this image?", "images": ["<base64>"]}], "stream": false}'

# List available models
curl https://ollama.com/api/tags -H "Authorization: Bearer $OLLAMA_API_KEY"
```

---

## All 34 Cloud Models

### Vision Models
| Model | Size | Best For |
|-------|------|----------|
| `qwen3-vl:235b` | 437GB | Vision + language, raw |
| `qwen3-vl:235b-instruct` | 437GB | Vision + language, instruction-tuned |
| `gemma3:27b` | — | Multimodal (text + image) |
| `glm-4.6` | 648GB | Z.AI vision model (same as glm-4.6v) |

### Reasoning / Heavy
| Model | Size | Best For |
|-------|------|----------|
| `kimi-k2.5` | 1041GB | Largest available, deep reasoning |
| `kimi-k2:1t` | — | Kimi K2 base |
| `kimi-k2-thinking` | — | Kimi with thinking/reasoning tokens |
| `deepseek-v3.1:671b` | — | DeepSeek V3.1 |
| `deepseek-v3.2` | — | DeepSeek V3.2 (latest) |
| `qwen3.5:397b` | 369GB | Qwen 3.5 flagship |
| `glm-5` | — | GLM 5 (Z.AI latest) |
| `glm-4.7` | 648GB | GLM 4.7 |
| `cogito-2.1:671b` | — | 671B reasoning model |
| `gpt-oss:120b` | — | OpenAI open source 120B |
| `nemotron-3-super` | 214GB | NVIDIA Nemotron |

### MiniMax
| Model | Size | Best For |
|-------|------|----------|
| `minimax-m2.7` | 214GB | Lux agent, fast reasoning |
| `minimax-m2.5` | 214GB | Previous gen |
| `minimax-m2.1` | 214GB | Older |
| `minimax-m2` | 214GB | Base |

### Code
| Model | Size | Best For |
|-------|------|----------|
| `qwen3-coder:480b` | 475GB | Code generation, 480B |
| `qwen3-coder-next` | — | Next-gen code model |
| `devstral-2:123b` | 119GB | Mistral code model |
| `devstral-small-2:24b` | — | Smaller Mistral code |

### Fast / Small
| Model | Size | Best For |
|-------|------|----------|
| `qwen3-next:80b` | 76GB | Fast Qwen |
| `gpt-oss:20b` | 12GB | Smallest GPT open source |
| `gemma3:12b` | — | Small multimodal |
| `gemma3:4b` | — | Tiny multimodal |
| `ministral-3:14b` | — | Mistral small |
| `ministral-3:8b` | — | Mistral tiny |
| `ministral-3:3b` | — | Mistral micro |
| `nemotron-3-nano:30b` | — | NVIDIA small |
| `rnj-1:8b` | — | 8B model |

### Other
| Model | Size | Best For |
|-------|------|----------|
| `mistral-large-3:675b` | — | Mistral flagship |
| `gemini-3-flash-preview` | — | Google Gemini |

---

## Ahmad's Go-To Models

| Use Case | Model | Why |
|----------|-------|-----|
| **Default chat** | `kimi-k2.5` | Biggest brain, deep reasoning |
| **Vision (read images/PDFs)** | `qwen3-vl:235b-instruct` | Best vision model available |
| **Fast reasoning** | `qwen3.5:397b` | 397B, fast, strong |
| **Code** | `qwen3-coder:480b` | 480B code specialist |
| **LED extraction fallback** | `glm-5` | Same as Z.AI GLM-5 |
| **Lux agent** | `minimax-m2.7` | Already configured |

---

## Environment Variable

Already set in `~/.bashrc`:
```bash
export OLLAMA_API_KEY="6b6342c108094603892c627b2e25fb23.yhHhquTdzFKyD0dUEE7ewVj6"
```

---

## API Reference

### Chat Completion
```
POST https://ollama.com/api/chat
Authorization: Bearer <key>

{
  "model": "kimi-k2.5",
  "messages": [
    {"role": "system", "content": "You are helpful"},
    {"role": "user", "content": "Question here"}
  ],
  "stream": false,
  "options": {
    "temperature": 0,
    "num_predict": 4096
  }
}
```

### Vision (with image)
```
POST https://ollama.com/api/chat
Authorization: Bearer <key>

{
  "model": "qwen3-vl:235b-instruct",
  "messages": [
    {"role": "user", "content": "Describe this image", "images": ["<base64_image>"]}
  ],
  "stream": false
}
```

### Streaming
Same as above but `"stream": true`. Response comes as newline-delimited JSON.

### List Models
```
GET https://ollama.com/api/tags
Authorization: Bearer <key>
```
