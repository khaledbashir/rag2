// Create ANC Proposal — AnythingLLM Custom Agent Skill
// Bridges estimator chat conversations to the ANC Proposal Engine.
// Accepts line items collected during pricing logic sessions and
// creates a real project with a shareable link.

module.exports.runtime = {
  handler: async function ({ client_name, line_items, document_type, project_name, notes }) {
    try {
      // Validate required params
      if (!client_name || !client_name.trim()) {
        return "FAILED: client_name is required. Ask the user for the client or venue name. Do not retry.";
      }

      if (!line_items) {
        return "FAILED: line_items is required. Ask the user for line items as {description, price} pairs. Do not retry.";
      }

      // Parse line items
      let items;
      try {
        items = typeof line_items === "string" ? JSON.parse(line_items) : line_items;
      } catch (e) {
        return `FAILED: Could not parse line_items JSON. Make sure it's a valid array. Got: ${line_items}. Do not retry.`;
      }

      if (!Array.isArray(items) || items.length === 0) {
        return "FAILED: line_items must be a non-empty array of {description, price} objects. Do not retry.";
      }

      // Get config from setup_args
      const baseUrl = (this.runtimeArgs["ANC_BASE_URL"] || "https://proposals.anc.com").replace(/\/+$/, "");
      const apiKey = this.runtimeArgs["API_KEY"];

      if (!apiKey) {
        return "FAILED: API_KEY not configured. Go to Agent Settings > Skills > Create ANC Proposal > gear icon and set your AGENT_SKILL_API_KEY. Do not retry.";
      }

      // Calculate total for the progress message
      const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const formattedTotal = total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

      this.introspect(`Creating ${(document_type || "budget").toUpperCase()} for ${client_name.trim()}...`);
      this.introspect(`${items.length} line item(s) totaling ${formattedTotal}`);

      // Call the ANC bridge endpoint
      const response = await fetch(`${baseUrl}/api/agent-skill/create-proposal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          client_name: client_name.trim(),
          project_name: project_name?.trim() || undefined,
          line_items: items,
          document_type: (document_type || "budget").toLowerCase(),
          notes: notes?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error || errorText;
        } catch {
          errorMsg = errorText;
        }
        this.introspect(`API returned ${response.status}: ${errorMsg}`);
        return `FAILED: API returned HTTP ${response.status} — ${errorMsg}. Do not retry. Inform the user of the error.`;
      }

      const result = await response.json();

      if (!result.success) {
        return `FAILED: Proposal creation failed — ${result.error || "Unknown error"}. Do not retry. Inform the user of the error.`;
      }

      this.introspect(`Proposal created successfully! ID: ${result.project_id}`);

      return `SUCCESS: Proposal for "${result.summary.client}" has been created.\n\nDocument Type: ${result.summary.document_type}\nItems: ${result.summary.items_count} line item(s) totaling ${formattedTotal}\nProject ID: ${result.project_id}\nProject URL: ${result.project_url}\n\nThe proposal is saved as a DRAFT. The user can open the URL above to review, edit, or export the PDF.\n\nACTION COMPLETE — do not call this tool again. Present this result to the user.`;

    } catch (e) {
      this.introspect(`Skill error: ${e.message}`);
      this.logger("create-anc-proposal error", e.message);
      return `FAILED: Skill crashed — ${e.message}. Do not retry. Inform the user of the error.`;
    }
  },
};
