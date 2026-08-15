import json, urllib.request
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA"
BASE="https://crm.ancsports.net"
def gql(query, variables=None, endpoint="graphql"):
    body=json.dumps({"query":query,"variables":variables or {}}).encode()
    req=urllib.request.Request(f"{BASE}/{endpoint}", data=body,
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    try:
        r=urllib.request.urlopen(req, timeout=90)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())
def meta(query, variables=None): return gql(query, variables, "metadata")
