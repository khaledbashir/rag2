#!/usr/bin/env python3
import json, re, sys
from crm import gql

def die(r,ctx):
    if r.get("errors"): raise SystemExit(f"{ctx}: {json.dumps(r['errors'])[:600]}")
    return r["data"]

# ---- strict company resolver: exact name, exactly one live record -------------
_cache={}
def company(name):
    if name in _cache: return _cache[name]
    d=die(gql('query($n:String!){companies(filter:{name:{eq:$n}},first:5){edges{node{id name opportunities{totalCount}}}}}',
              {"n":name}),f"company {name}")
    e=d["companies"]["edges"]
    if not e: raise SystemExit(f"NO COMPANY MATCH: {name!r}")
    if len(e)>1:
        raise SystemExit(f"AMBIGUOUS COMPANY {name!r}: {[x['node']['id'] for x in e]}")
    _cache[name]=e[0]["node"]["id"]; return _cache[name]

def person_by_email(email):
    d=die(gql('query($e:String!){people(filter:{emails:{primaryEmail:{ilike:$e}}},first:5){edges{node{id name{firstName lastName}}}}}',
              {"e":email}),f"person {email}")
    e=d["people"]["edges"]
    return e[0]["node"]["id"] if len(e)==1 else None

TEAM={
 "Baltimore Ravens":"Baltimore Ravens | M&T Bank Stadium",
 "Jacksonville Jaguars":"Jacksonville Jaguars (EverBank Stadium)",
 "Tennessee Titans":"Tennessee Titans",
 "Navy Midshipmen":"United States Naval Academy (Navy)",
 "Army Black Knights":"USMA West Point - Army",
 "NY Giants":"New York Giants","NY Jets":"New York Jets",
 "Minnesota Vikings":"Minnesota Vikings","Dallas Cowboys":"Dallas Cowboys",
 "Arizona Cardinals":"Arizona Cardinals",
 "New Orleans Saints":"New Orleans Saints (Caesars Superdome)",
 "Washington Commanders":"Washington Commanders",
 "Philadelphia Eagles":"Philadelphia Eagles | Lincoln Financial Field",
 "San Francisco 49ers":"San Francisco 49ers | Levi's Stadium",
 "Cleveland Browns":"Cleveland Browns","Tampa Bay Buccaneers":"Tampa Bay Buccaneers",
 "Green Bay Packers":"Green Bay Packers","Miami Dolphins":"Miami Dolphins | Hard Rock Stadium",
 "Las Vegas Raiders":"Las Vegas Raiders","Buffalo Bills":"Buffalo Bills",
 "Denver Broncos":"Denver Broncos","New England Patriots":"New England Patriots",
 "Seattle Seahawks":"Seattle Seahawks","Los Angeles Rams":"Los Angeles Rams / SoFi Stadium",
}
GUEST={"Hankook":"Hankook Tire America Corp.","Iona Prep":"Iona Prep","Iona prep":"Iona Prep",
       "Nationals":"Washington Nationals","LG":"LG Electronics"}
SEASON={"PreSeason":"PRESEASON","Regular Season":"REGULAR_SEASON","Speciality Game":"SPECIALTY_GAME","TBD":"TBD"}

# ---- suites -------------------------------------------------------------------
SUITES=[
 dict(name="Levi's Stadium — Suite 603", stadium="Levi's Stadium", suiteNumber="603",
      teams="San Francisco 49ers", ticketsTotal=16,
      ticketDetail="16 Total Tickets (Purchase up to +4 SRO by request)",
      fieldPasses="16 of tickets total for the season (max 4/game)",
      parkingTotal=5,
      parkingDetail="5 TOTAL = 4 x GA Lot, Designated Space Red VIP Row 1, Spot #29",
      suiteLocation="Location: / Zone: / Entrance:",
      foodBeverage="Catering - All Inclusive Package Included, Dedicated Suite Attendant, Different Activations in the Mixing Zone each Game. We can order specifics or customized 3-5 Business Days before each game.",
      venueContacts="Levy Contact: Reyes, Rebekah <RReyes@Levyrestaurants.com>; Agustin, Fitzgerald <fagustin@Levyrestaurants.com>",
      suiteNotes="Recommends: Churrasco Steak Sandwich, American Wagyu Burger, Skuna Bay Salmon Board and Omakase-Style Sushi Platter. ANC Locker on site.",
      suiteLinks={"primaryLinkUrl":"https://faithfultothefans.com/","primaryLinkLabel":"Faithful to the Fans"}),
 dict(name="MetLife Stadium — Suite 6-10", stadium="MetLife Stadium", suiteNumber="6-10",
      teams="New York Giants / New York Jets", ticketsTotal=24,
      ticketDetail="24 Total = 18 Seated Tickets, 6 Bar Top/SRO Tickets",
      fieldPasses=None, parkingTotal=6,
      parkingDetail="6 TOTAL = 2 E&S Reserved, 4 Platinum Lot",
      suiteLocation="Location: / Zone: / Entrance: Bud Light Entrance, Sec 6-10",
      foodBeverage="Not Included. Min. 3 business days before game - order with Delaware North directly: metlifesuites@delawarenorth.com",
      venueContacts="metlifesuites@delawarenorth.com",
      suiteNotes="You can bring in food and drinks from the Club-only Level, when we do not have a F&B catering package.",
      suiteLinks=None),
]
suite_id={}
for s in SUITES:
    payload={k:v for k,v in s.items() if v is not None}
    d=die(gql('mutation($d:SuitePackageCreateInput!){createSuitePackage(data:$d){id name}}',{"d":payload}),"createSuite")
    suite_id[s["stadium"]]=d["createSuitePackage"]["id"]
    print("suite:",d["createSuitePackage"]["name"],d["createSuitePackage"]["id"])

# ---- games --------------------------------------------------------------------
games=json.load(open("games.json"))
EMAIL_RE=re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
made=[]
for g in games:
    home=g["Home Team"]; away=g["Away Team"]
    date=g.get("Date"); booked=(g.get("ANC / Client Booked") or "").strip()
    status=(g.get("Status") or "").strip(); notes=(g.get("Game Notes") or "").strip()
    iso = date if (date and re.match(r'^\d{4}-\d{2}-\d{2}$',date)) else None
    label = date if not iso else None
    nm=f"{iso or label} · {home} vs {away}"
    rec={"name":nm,"stadium":g["Stadium"],
         "seasonType":SEASON[g["Pre/Regular Season"]],
         "dayOfWeek":g.get("Day of Week"),"kickoff":g.get("Time"),
         "homeTeamId":company(TEAM[home]),
         "ticketsSent":bool(g.get("Tickets sent?")),"parkingSent":False}
    if iso: rec["gameDate"]=iso+"T00:00:00.000Z"
    if label: rec["scheduleNote"]=label
    if away in TEAM: rec["awayTeamId"]=company(TEAM[away])
    else: rec["gameNotes"]=(notes+" | " if notes else "")+f"Away team: {away}"
    if g["Stadium"] in suite_id: rec["suiteId"]=suite_id[g["Stadium"]]
    if status: rec["bookingNotes"]=status
    if notes and "gameNotes" not in rec: rec["gameNotes"]=notes

    # status
    if rec["ticketsSent"]: st="TICKETS_SENT"
    elif status.lower().startswith("sell"): st="FOR_SALE"
    elif booked.lower().startswith("hold"): st="HELD"
    elif booked or notes.strip(): st="ASSIGNED"
    else: st="OPEN"
    rec["bankStatus"]=st

    # host / guest
    if booked:
        host=re.sub(r'^Hold:\s*','',booked).strip()
        gc=None
        for k,v in GUEST.items():
            if k.lower() in booked.lower(): gc=v; break
        if gc:
            rec["guestCompanyId"]=company(gc)
            rec["bookingNotes"]=(rec.get("bookingNotes","") )
            rec["ancHost"]=None
        else:
            rec["ancHost"]=host
    if not booked and "Tom Bingham" in notes:
        rec["guestCompanyId"]=company("LG Electronics")

    # contacts
    for em,label_ in [("jack.armstrong@hankookn.com","Jack Armstrong"),
                      ("matt.lemire@nationals.com","Matt Lemire"),
                      ("tom.bingham@lge.com","Tom Bingham")]:
        if label_.split()[1] in (booked+" "+notes):
            pid=person_by_email(em)
            if pid: rec["guestContactId"]=pid

    # emails buried in the status column + game notes
    emails=EMAIL_RE.findall(status)+EMAIL_RE.findall(notes)
    emails=[e.strip('<>') for e in emails]
    if emails:
        rec["guestEmails"]={"primaryEmail":emails[0],
                            "additionalEmails":emails[1:] if len(emails)>1 else []}
    # seats
    m=re.search(r'\((\d+)\)', booked+" "+status+" "+notes)
    if m: rec["seatsCommitted"]=int(m.group(1))

    rec={k:v for k,v in rec.items() if v not in (None,"")}
    d=die(gql('mutation($d:SuiteGameCreateInput!){createSuiteGame(data:$d){id name bankStatus}}',{"d":rec}),f"createGame {nm}")
    made.append(d["createSuiteGame"])
    print(f'  {d["createSuiteGame"]["bankStatus"]:<13} {nm}')
print(f"\n{len(made)} games created")
