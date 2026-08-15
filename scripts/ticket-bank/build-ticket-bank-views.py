#!/usr/bin/env python3
import json
from crm import meta
SG="5ffe23ec-d71d-4495-be34-e17539bc0269"
def die(r,c):
    if r.get("errors"): raise SystemExit(f"{c}: {json.dumps(r['errors'])[:700]}")
    return r["data"]
F={f["name"]:f["id"] for f in die(meta("query($id:UUID!){object(id:$id){fieldsList{id name}}}",{"id":SG}),"f")["object"]["fieldsList"]}
print("name field:",F["name"])

def mkview(name,vtype,icon,group=None,hide_empty=False,pos=0):
    inp={"name":name,"objectMetadataId":SG,"type":vtype,"icon":icon,"position":pos,
         "openRecordIn":"RECORD_PAGE"}
    if group: inp["mainGroupByFieldMetadataId"]=group; inp["shouldHideEmptyGroups"]=hide_empty
    d=die(meta("mutation($input:CreateViewInput!){createView(input:$input){id name}}",{"input":inp}),f"view {name}")
    print("view:",d["createView"]["name"],d["createView"]["id"]); return d["createView"]["id"]

def vf(vid,fname,pos,visible=True,size=None,agg=None):
    inp={"viewId":vid,"fieldMetadataId":F[fname],"position":pos,"isVisible":visible}
    if size: inp["size"]=size
    if agg: inp["aggregateOperation"]=agg
    die(meta("mutation($input:CreateViewFieldInput!){createViewField(input:$input){id}}",{"input":inp}),f"vf {fname}")

def vsort(vid,fname,direction="ASC"):
    die(meta("mutation($input:CreateViewSortInput!){createViewSort(input:$input){id}}",
        {"input":{"viewId":vid,"fieldMetadataId":F[fname],"direction":direction}}),f"sort {fname}")

def vfilter(vid,fname,operand,value):
    die(meta("mutation($input:CreateViewFilterInput!){createViewFilter(input:$input){id}}",
        {"input":{"viewId":vid,"fieldMetadataId":F[fname],"operand":operand,"value":value}}),f"filter {fname}")

COLS=[("name",-1,True,320,"COUNT"),("gameDate",0,True,130,None),("dayOfWeek",1,True,100,None),
      ("kickoff",2,True,90,None),("bankStatus",3,True,130,None),("stadium",4,True,170,None),
      ("suite",5,True,200,None),("homeTeam",6,True,200,None),("awayTeam",7,True,200,None),
      ("seasonType",8,True,140,None),("ancHost",9,True,170,None),("guestCompany",10,True,190,None),
      ("guestContact",11,True,170,None),("guestEmails",12,True,220,None),
      ("seatsCommitted",13,True,120,"SUM"),("ticketsSent",14,True,110,None),
      ("parkingSent",15,True,110,None),("bookingNotes",16,True,300,None),
      ("gameNotes",17,True,300,None),("opportunity",18,False,180,None),
      ("scheduleNote",19,False,120,None)]

# A. main bank, grouped by status
A=mkview("NFL Ticket Bank 2026/27","TABLE","IconTicket",group=F["bankStatus"],hide_empty=False,pos=0)
for n,p,v,s,a in COLS: vf(A,n,p,v,s,a)
vsort(A,"name","ASC")

# B. operational queue
B=mkview("Tickets to Send","TABLE","IconSend",pos=1)
for n,p,v,s,a in COLS: vf(B,n,p,v,s,a)
vsort(B,"name","ASC")
vfilter(B,"bankStatus","IS",json.dumps(["ASSIGNED"]))
vfilter(B,"ticketsSent","IS",json.dumps([False]))

# C. board
C=mkview("Ticket Bank Board","KANBAN","IconLayoutKanban",group=F["bankStatus"],hide_empty=False,pos=2)
for n,p,v,s,a in COLS[:12]: vf(C,n,p,v,s,a)

# D. still available
D=mkview("Open & For Sale","TABLE","IconTag",pos=3)
for n,p,v,s,a in COLS: vf(D,n,p,v,s,a)
vsort(D,"name","ASC")
vfilter(D,"bankStatus","IS",json.dumps(["OPEN","FOR_SALE"]))

print(json.dumps({"bank":A,"toSend":B,"board":C,"open":D}))
