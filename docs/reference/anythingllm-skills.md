# AnythingLLM Custom Agent Skills Reference

## What They Are
Custom Node.js skills that extend `@agent` capabilities in AnythingLLM.
Available in Docker v1.2.2+ and Desktop v1.6.5+.

## File Structure
```
plugins/agent-skills/{hubId}/
├── plugin.json    # Metadata + params + setup_args
├── handler.js     # Runtime logic
└── README.md      # Optional
```
Folder name MUST match `hubId` in plugin.json.

## Ahmad's Setup
- EasyPanel: `basheer / anything-llm`
- Container path: `/app/server/storage/plugins/agent-skills/`
- Volume: `storage` → `/app/server/storage`
- Hot reload: exit agent session + refresh browser, no restart needed

## Key Rules
1. handler.js MUST return a string (anything else = infinite loop)
2. Wrap everything in try/catch, return errors as strings
3. `this.introspect(msg)` = show thinking in UI
4. `this.runtimeArgs` = setup_args from plugin.json
5. `this.config` = `{ name, hubId, version }`
6. Bundle node_modules inside skill folder if needed
7. `require()` inside handler, not top-level

## Docs
- [Developer Guide](https://docs.anythingllm.com/agent/custom/developer-guide)
- [plugin.json ref](https://docs.anythingllm.com/agent/custom/plugin-json)
- [handler.js ref](https://docs.anythingllm.com/agent/custom/handler-js)
- [Introduction](https://docs.anythingllm.com/agent/custom/introduction)
