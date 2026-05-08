import { NextRequest, NextResponse } from "next/server";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query Search($q:String!){
        companies(first:8, filter:{name:{ilike:$q}}, orderBy:[{name:AscNullsLast}]){
          edges{ node{ id name } }
        }
      }`,
      variables: { q: `%${q}%` },
    }),
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json({ hits: [] }, { status: res.status });
  const body = await res.json();
  const hits = (body?.data?.companies?.edges || []).map((e: any) => ({
    id: e.node.id,
    name: e.node.name,
  }));
  return NextResponse.json({ hits });
}
