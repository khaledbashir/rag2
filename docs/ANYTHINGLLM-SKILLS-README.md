# AnythingLLM Custom Skills Builder & Deployment System

## Quick Start

### 1. Create a New Skill (Interactive)
```bash
node create-anythingllm-skill.js
```
Follow the prompts to select a template and configure your skill.

### 2. Deploy to AnythingLLM
```bash
# Deploy a specific skill
./deploy-to-anythingllm.sh .claude/generated-skills/your-skill-name

# Or use the skill's own deploy script
cd .claude/generated-skills/your-skill-name
./deploy.sh
```

### 3. Activate in AnythingLLM
1. Reload your AnythingLLM interface (exit agent chat + refresh browser)
2. Go to Agent Settings > Skills
3. Find and toggle on your new skill
4. Click the gear icon to configure setup arguments

## Available Pre-Built ANC Skills

All skills are located in `.claude/generated-skills/`

| Skill | Hub ID | Description |
|-------|--------|-------------|
| **ANC Product Lookup** | `anc-product-lookup` | Search LED product catalog by manufacturer, pitch, environment |
| **ANC Proposal Generator** | `anc-proposal-generator` | Generate proposals, budgets, and LOIs from project data |
| **ANC Estimation Calculator** | `anc-estimation-calculator` | Calculate project costs and margins |
| **ANC Project Intelligence** | `anc-project-intelligence` | Query project database and status |
| **ANC Client Manager** | `anc-client-manager` | Manage client information and history |
| **Generate Margin Analysis** | `generate-margin-analysis` | Analyze pricing and margin opportunities |

## Skill Structure

Every AnythingLLM skill requires:
```
skill-folder/
├── plugin.json    # Metadata & configuration
├── handler.js     # Runtime logic
└── deploy.sh      # Deployment script
```

### plugin.json Schema
```json
{
  "active": true,
  "name": "Human Readable Name",
  "hubId": "folder-name-must-match",
  "schema": "skill-1.0.0",
  "version": "1.0.0",
  "description": "What the skill does (LLM reads this)",
  "author": "@basheer",
  "setup_args": {
    // UI-configurable settings
  },
  "examples": [
    // Few-shot examples for LLM
  ],
  "entrypoint": {
    "file": "handler.js",
    "params": {
      // Parameters the LLM passes
    }
  },
  "imported": true
}
```

### handler.js Template
```javascript
module.exports.runtime = {
  handler: async function ({ param1, param2 }) {
    try {
      this.introspect(`Processing...`);

      // Access setup args
      const apiUrl = this.runtimeArgs["API_URL"];

      // Your logic here
      const result = await doSomething();

      // MUST return string
      return JSON.stringify(result, null, 2);
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }
};
```

## Skill Builder Templates

The interactive builder includes templates for:

1. **API Proxy** - Wrap any REST API for conversational access
2. **Database Query** - Query databases and return formatted results
3. **ANC Integration** - Pre-configured for ANC Proposal Engine
4. **Custom** - Build anything from scratch

## Deployment Methods

### Method 1: Master Deploy Script
```bash
./deploy-to-anythingllm.sh .claude/generated-skills/skill-name
```

### Method 2: Individual Deploy Script
```bash
cd .claude/generated-skills/skill-name
./deploy.sh
```

### Method 3: Manual Docker Copy
```bash
# Find container
docker ps | grep anything-llm

# Copy skill folder
docker cp ./skill-folder CONTAINER:/app/server/storage/plugins/agent-skills/
```

## Your AnythingLLM Configuration

- **Service**: basheer / anything-llm (EasyPanel)
- **URL**: https://basheer-anything-llm.c9tnyg.easypanel.host
- **Container**: `basheer_anything-llm.1.nofw02yss38mc4kahdra7jt5b`
- **Skills Path**: `/app/server/storage/plugins/agent-skills/`
- **Hot Reload**: Yes (no restart needed)

## Troubleshooting

### Skill Not Appearing
- Ensure folder name matches `hubId` exactly
- Check `"active": true` in plugin.json
- Reload browser after deployment

### Skill Not Working
- Check handler.js returns a string (not object)
- Wrap everything in try/catch
- Check container logs: `docker logs CONTAINER_NAME`

### Parameter Issues
- Ensure examples in plugin.json match actual params
- All params come as strings (convert if needed)
- Use `this.introspect()` for debugging

## Best Practices

1. **Always return strings** from handler.js
2. **Use descriptive skill descriptions** - the LLM uses these to decide when to invoke
3. **Provide good examples** - helps the LLM understand usage patterns
4. **Handle errors gracefully** - return error messages as strings
5. **Use setup_args** for configuration that might change
6. **Test locally first** before deploying to container

## Creating New Skills

### Quick Command
```bash
# Interactive builder
node create-anythingllm-skill.js

# Follow prompts:
# 1. Select template (1-4)
# 2. Enter skill name
# 3. Enter hub ID (kebab-case)
# 4. Enter description
# 5. Define parameters
# 6. Add examples
```

### Manual Creation
1. Create folder: `mkdir -p .claude/generated-skills/my-skill`
2. Create `plugin.json` with proper schema
3. Create `handler.js` with runtime.handler function
4. Test locally if possible
5. Deploy with `./deploy-to-anythingllm.sh`

## ANC-Specific Integration Points

When building ANC skills, use these endpoints:

- **Products API**: `/api/products`
- **Projects API**: `/api/projects`
- **Proposals API**: `/api/proposals`
- **Excel Upload**: `/api/upload-excel`
- **PDF Generation**: `/api/generate-pdf`

Base URL: `https://basheer-therag2.prd42b.easypanel.host`

## Support

- **Skill Builder Location**: `/root/rag2/create-anythingllm-skill.js`
- **Generated Skills**: `/root/rag2/.claude/generated-skills/`
- **Deploy Script**: `/root/rag2/deploy-to-anythingllm.sh`
- **Container Access**: Via EasyPanel terminal or Docker CLI