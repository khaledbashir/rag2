#!/bin/bash
# Create impressive Twenty CRM dashboards via GraphQL API
set -euo pipefail

TWENTY_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
TWENTY_META="https://abc-twenty.izcgmb.easypanel.host/metadata"

# Object metadata IDs
COMP_OBJ="ccd95b3f-4a9a-443c-b8f2-01bff6c479ab"
OPP_OBJ="c779922d-cf25-4a5e-9382-23eb1c02199e"
PERSON_OBJ="fb3ffcb0-ba14-4825-9cd6-1f797ebe417a"

# Company field IDs
COMP_LEAGUE="614b5f70-8a1e-4eda-9861-f73a7739f143"
COMP_STATUS="8a0b66c8-969e-4ee9-9dd9-95d470e57bef"
COMP_VENUE_TYPE="c3d4b25b-5af1-4528-bdcd-0e6883703adf"
COMP_REGION="1c9112de-e6cf-4c7c-a31a-b55915faab5f"
COMP_REVENUE_TYPE="651a1524-d8e9-402c-98bf-bcbb7560783b"
COMP_ACV="33711ea5-9479-417a-8cc1-1994033966ed"
COMP_CREATED="73e4b262-132c-4d71-88ac-914836b408e0"  # placeholder

# Opportunity field IDs
OPP_STAGE="09da76a4-8deb-4ea6-a819-42ad92eada4f"
OPP_BID_STATUS="ad436148-604e-4b05-a5a7-9bcc35117410"
OPP_AMOUNT="abe371af-8f95-413f-8e57-eee130a03d3d"
OPP_CLOSE_DATE="56c90982-6391-4cdf-8b61-9d0097226807"
OPP_DEAL_SIZE="60eacd7f-f146-4952-9802-4d31f862bc2a"
OPP_PROJECT_TYPE="bce20420-6086-445e-8215-ae146bbb10fc"
OPP_CREATED="73e4b262-132c-4d71-88ac-914836b408e0"

gql() {
  curl -s -X POST "$TWENTY_META" \
    -H "Authorization: Bearer $TWENTY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# ============================================================================
# DASHBOARD 1: Sales Command Center
# ============================================================================
echo "=== Creating Sales Command Center Dashboard ==="

# First get the existing Pipeline dashboard and update it
PIPELINE_DASH="13e4394c-a354-4f75-97ae-8c0f4ebab9b8"
PIPELINE_TAB="cc95453a-4fba-412b-a293-16a8c7e95886"

# Add widgets to the Pipeline Overview dashboard
echo "  Adding: Total Pipeline Value (aggregate)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Total Pipeline Value\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 0, \"column\": 0, \"rowSpan\": 1, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"AGGREGATE_CHART\",
        \"aggregateFieldMetadataId\": \"$OPP_AMOUNT\",
        \"aggregateOperation\": \"SUM\",
        \"label\": \"Total Pipeline\",
        \"displayDataLabel\": true,
        \"prefix\": \"\$\",
        \"description\": \"Sum of all open opportunity amounts\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Total Deals (count)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Total Deals\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 0, \"column\": 2, \"rowSpan\": 1, \"columnSpan\": 1},
      \"configuration\": {
        \"configurationType\": \"AGGREGATE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"label\": \"Active Deals\",
        \"displayDataLabel\": true,
        \"description\": \"Total number of opportunities\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Total Accounts (count)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Total Accounts\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 0, \"column\": 3, \"rowSpan\": 1, \"columnSpan\": 1},
      \"configuration\": {
        \"configurationType\": \"AGGREGATE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"label\": \"Accounts\",
        \"displayDataLabel\": true,
        \"description\": \"Total companies in CRM\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Deals by Stage (pie)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Deals by Stage\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 1, \"column\": 0, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"PIE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"groupByFieldMetadataId\": \"$OPP_STAGE\",
        \"displayDataLabel\": true,
        \"showCenterMetric\": true,
        \"displayLegend\": true,
        \"hideEmptyCategory\": true,
        \"description\": \"Distribution of opportunities across pipeline stages\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Deals by Bid Status (bar)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Deals by Bid Status\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 1, \"column\": 2, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"BAR_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"primaryAxisGroupByFieldMetadataId\": \"$OPP_BID_STATUS\",
        \"primaryAxisOrderBy\": \"VALUE_DESC\",
        \"displayDataLabel\": true,
        \"displayLegend\": false,
        \"layout\": \"VERTICAL\",
        \"description\": \"Opportunities grouped by bid status\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Pipeline by Deal Size (bar)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Revenue by Deal Size\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 3, \"column\": 0, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"BAR_CHART\",
        \"aggregateFieldMetadataId\": \"$OPP_AMOUNT\",
        \"aggregateOperation\": \"SUM\",
        \"primaryAxisGroupByFieldMetadataId\": \"$OPP_DEAL_SIZE\",
        \"primaryAxisOrderBy\": \"VALUE_DESC\",
        \"displayDataLabel\": true,
        \"displayLegend\": false,
        \"layout\": \"VERTICAL\",
        \"description\": \"Total deal value grouped by size tier\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Deals by Close Date (line)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$PIPELINE_TAB\",
      \"title\": \"Deals Over Time\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 3, \"column\": 2, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"LINE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"primaryAxisGroupByFieldMetadataId\": \"$OPP_CLOSE_DATE\",
        \"primaryAxisDateGranularity\": \"QUARTER\",
        \"primaryAxisOrderBy\": \"FIELD_ASC\",
        \"displayDataLabel\": false,
        \"displayLegend\": false,
        \"isCumulative\": false,
        \"description\": \"Deal volume by quarter\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

# ============================================================================
# DASHBOARD 2: Account Intelligence (use My First Dashboard)
# ============================================================================
echo ""
echo "=== Populating Account Intelligence Dashboard ==="

ACCT_DASH="5459873b-a004-4378-a551-25a05c20e8ed"
ACCT_TAB="6004ff47-591c-4537-99e4-bd899f30f356"

echo "  Adding: Accounts by League (pie)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Accounts by League\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 0, \"column\": 0, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"PIE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"groupByFieldMetadataId\": \"$COMP_LEAGUE\",
        \"displayDataLabel\": true,
        \"showCenterMetric\": true,
        \"displayLegend\": true,
        \"hideEmptyCategory\": true,
        \"description\": \"Company distribution across sports leagues\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Accounts by Region (pie)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Accounts by Region\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 0, \"column\": 2, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"PIE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"groupByFieldMetadataId\": \"$COMP_REGION\",
        \"displayDataLabel\": true,
        \"showCenterMetric\": true,
        \"displayLegend\": true,
        \"hideEmptyCategory\": true,
        \"description\": \"Geographic distribution of accounts\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Venue Type Distribution (bar)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Accounts by Venue Type\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 2, \"column\": 0, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"BAR_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"primaryAxisGroupByFieldMetadataId\": \"$COMP_VENUE_TYPE\",
        \"primaryAxisOrderBy\": \"VALUE_DESC\",
        \"displayDataLabel\": true,
        \"displayLegend\": false,
        \"layout\": \"HORIZONTAL\",
        \"description\": \"Stadium vs Arena vs University etc\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Service Status (bar)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Client Lifecycle Status\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 2, \"column\": 2, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"BAR_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"primaryAxisGroupByFieldMetadataId\": \"$COMP_STATUS\",
        \"primaryAxisOrderBy\": \"VALUE_DESC\",
        \"displayDataLabel\": true,
        \"displayLegend\": false,
        \"layout\": \"HORIZONTAL\",
        \"description\": \"Prospect → Active → Warranty → Post-Warranty\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Revenue Type Split (pie)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Revenue Streams\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$COMP_OBJ\",
      \"gridPosition\": {\"row\": 4, \"column\": 0, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"PIE_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"groupByFieldMetadataId\": \"$COMP_REVENUE_TYPE\",
        \"displayDataLabel\": true,
        \"showCenterMetric\": true,
        \"displayLegend\": true,
        \"hideEmptyCategory\": true,
        \"description\": \"Technology vs Services vs Media vs Hybrid\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

sleep 1

echo "  Adding: Opportunities by Project Type (bar)"
gql "{
  \"query\": \"mutation(\$input: CreatePageLayoutWidgetInput!) { createPageLayoutWidget(input: \$input) { id title } }\",
  \"variables\": {
    \"input\": {
      \"pageLayoutTabId\": \"$ACCT_TAB\",
      \"title\": \"Deals by Project Type\",
      \"type\": \"GRAPH\",
      \"objectMetadataId\": \"$OPP_OBJ\",
      \"gridPosition\": {\"row\": 4, \"column\": 2, \"rowSpan\": 2, \"columnSpan\": 2},
      \"configuration\": {
        \"configurationType\": \"BAR_CHART\",
        \"aggregateOperation\": \"COUNT\",
        \"primaryAxisGroupByFieldMetadataId\": \"$OPP_PROJECT_TYPE\",
        \"primaryAxisOrderBy\": \"VALUE_DESC\",
        \"displayDataLabel\": true,
        \"displayLegend\": false,
        \"layout\": \"VERTICAL\",
        \"description\": \"New Build vs Renovation vs Expansion vs Service\"
      }
    }
  }
}" | jq '.data.createPageLayoutWidget.title // .errors[0].message'

# Rename dashboards
echo ""
echo "=== Renaming dashboards ==="

echo "  Renaming Pipeline Overview"
gql "{
  \"query\": \"mutation(\$id: String!, \$input: UpdatePageLayoutWithTabsInput!) { updatePageLayoutWithTabsAndWidgets(id: \$id, input: \$input) { id name } }\",
  \"variables\": {
    \"id\": \"$PIPELINE_DASH\",
    \"input\": {
      \"name\": \"Sales Command Center\",
      \"type\": \"DASHBOARD\",
      \"tabs\": [{\"id\": \"$PIPELINE_TAB\", \"title\": \"Pipeline\", \"position\": 0, \"widgets\": []}]
    }
  }
}" | jq '.data.updatePageLayoutWithTabsAndWidgets.name // .errors[0].message'

sleep 1

echo "  Renaming My First Dashboard"
gql "{
  \"query\": \"mutation(\$id: String!, \$input: UpdatePageLayoutWithTabsInput!) { updatePageLayoutWithTabsAndWidgets(id: \$id, input: \$input) { id name } }\",
  \"variables\": {
    \"id\": \"$ACCT_DASH\",
    \"input\": {
      \"name\": \"Account Intelligence\",
      \"type\": \"DASHBOARD\",
      \"tabs\": [{\"id\": \"$ACCT_TAB\", \"title\": \"Overview\", \"position\": 0, \"widgets\": []}]
    }
  }
}" | jq '.data.updatePageLayoutWithTabsAndWidgets.name // .errors[0].message'

echo ""
echo "=== DONE ==="
echo "Dashboards created:"
echo "  1. Sales Command Center — pipeline value, deal counts, stage pie, bid status bar, deal size revenue, timeline"
echo "  2. Account Intelligence — league pie, region pie, venue type bar, lifecycle bar, revenue streams, project types"
