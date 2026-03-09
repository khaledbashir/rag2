// generate-margin-analysis — AnythingLLM Custom Agent Skill
// Calls /api/agent-skill/generate-excel to produce a multi-sheet Excel workbook
// and returns the download link directly to the user.
// Version: 3.0.0

module.exports.runtime = {
  handler: async function ({ project_data_json }) {
    try {
      // Validate input
      if (!project_data_json || project_data_json === "{}") {
        return [
          "ERROR: No project data provided.",
          "The project_data_json parameter must contain a JSON object with:",
          '  - project_name: string',
          '  - displays: array of { name, cost, selling_price, margin_pct }',
          "",
          "TASK COMPLETE. Do not retry this tool. Ask the user for the required data."
        ].join("\n");
      }

      let projectData;
      try {
        projectData = typeof project_data_json === "string"
          ? JSON.parse(project_data_json)
          : project_data_json;
      } catch (parseErr) {
        return [
          `ERROR: Invalid JSON — ${parseErr.message}`,
          "",
          "TASK COMPLETE. Do not retry this tool. Fix the JSON and try once more, or ask the user."
        ].join("\n");
      }

      if (!projectData.project_name) {
        return [
          "ERROR: Missing 'project_name' in project data.",
          "",
          "TASK COMPLETE. Do not retry this tool. Ask the user for the project name."
        ].join("\n");
      }

      if (!projectData.displays || !Array.isArray(projectData.displays) || projectData.displays.length === 0) {
        return [
          "ERROR: Missing or empty 'displays' array in project data.",
          "At least one display group is required with: name, cost, selling_price, margin_pct",
          "",
          "TASK COMPLETE. Do not retry this tool. Ask the user for display information."
        ].join("\n");
      }

      this.introspect(
        `Generating Excel for "${projectData.project_name}" — ${projectData.displays.length} display(s)...`
      );

      const baseUrl = (this.runtimeArgs["ANC_API_URL"] || "https://proposals.anc.com").replace(/\/$/, "");

      // Call the generate-excel endpoint (no auth required)
      let response;
      try {
        response = await fetch(`${baseUrl}/api/agent-skill/generate-excel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectData)
        });
      } catch (fetchErr) {
        return [
          `ERROR: Could not reach ANC server at ${baseUrl}.`,
          `Network error: ${fetchErr.message}`,
          "",
          "The server may be down or unreachable.",
          "TASK COMPLETE. Do not retry this tool. Report this error to the user."
        ].join("\n");
      }

      // Check response
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text().catch(() => "");
        return [
          `ERROR: Server returned ${response.status} with non-JSON response.`,
          text ? `Response: ${text.substring(0, 200)}` : "",
          "",
          "TASK COMPLETE. Do not retry this tool. Report this error to the user."
        ].join("\n");
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        return [
          `ERROR: Excel generation failed — ${result.error || "Unknown error"}`,
          result.details ? `Details: ${result.details}` : "",
          "",
          "TASK COMPLETE. Do not retry this tool. Report this error to the user."
        ].join("\n");
      }

      // Build success response
      const summary = result.summary || {};
      let output = `EXCEL MARGIN ANALYSIS GENERATED SUCCESSFULLY!\n\n`;
      output += `📊 Download Link: ${result.download_url}\n\n`;
      output += `Project: ${projectData.project_name}\n`;
      output += `Date: ${projectData.date || new Date().toISOString().split("T")[0]}\n`;
      output += `Type: ${projectData.estimate_type || "Budget Estimate"}\n\n`;

      output += `SHEETS INCLUDED:\n`;
      (summary.sheets || ["Executive Summary", "Display Specifications", "Margin Waterfall"]).forEach((s, i) => {
        output += `  ${i + 1}. ${s}\n`;
      });

      output += `\nSUMMARY:\n`;
      output += `  Total Cost: $${(summary.total_cost || projectData.grand_total_cost || 0).toLocaleString()}\n`;
      output += `  Total Selling: $${(summary.total_selling || projectData.grand_total_selling || 0).toLocaleString()}\n`;
      output += `  Blended Margin: ${summary.margin_pct || projectData.grand_total_margin_pct || 0}%\n\n`;

      output += `The user can click the download link above to get the Excel file.\n\n`;
      output += `TASK COMPLETE. The Excel has been generated. Do not call any further tools.`;

      return output;
    } catch (e) {
      this.introspect(`Skill failed: ${e.message}`);
      return [
        `SKILL FAILED: ${e.message}`,
        "",
        "This is an unexpected error. Report it to the user.",
        "TASK COMPLETE. Do not retry this tool or call any other tools."
      ].join("\n");
    }
  },
};
