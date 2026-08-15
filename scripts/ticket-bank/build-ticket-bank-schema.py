#!/usr/bin/env python3
"""Build the NFL Ticket Bank objects in ANC's CRM. Idempotent."""
import time
from crm import gql, meta

COMPANY="ccd95b3f-4a9a-443c-b8f2-01bff6c479ab"
PERSON="fb3ffcb0-ba14-4825-9cd6-1f797ebe417a"
OPPORTUNITY="c779922d-cf25-4a5e-9382-23eb1c02199e"

def die(r, ctx):
    if r.get("errors"): raise SystemExit(f"{ctx}: {r['errors']}")
    return r["data"]

def objects():
    d=die(meta("query{objects(paging:{first:300}){edges{node{id nameSingular}}}}"),"objects")
    return {e["node"]["nameSingular"]:e["node"]["id"] for e in d["objects"]["edges"]}

def fields(oid):
    d=die(meta("query($id:UUID!){object(id:$id){fieldsList{id name type}}}",{"id":oid}),"fields")
    return {f["name"]:f for f in d["object"]["fieldsList"]}

def mk_object(ns,np,ls,lp,icon,desc):
    ex=objects()
    if ns in ex:
        print(f"  [skip] object {ns} -> {ex[ns]}"); return ex[ns]
    d=die(meta("""mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}""",
        {"input":{"object":{"nameSingular":ns,"namePlural":np,"labelSingular":ls,"labelPlural":lp,
                            "icon":icon,"description":desc,"isLabelSyncedWithName":False}}}),f"createObject {ns}")
    i=d["createOneObject"]["id"]; print(f"  [created] object {ns} -> {i}"); return i

def mk_field(oid,name,label,ftype,icon=None,desc=None,options=None,relation=None,default=None):
    ex=fields(oid)
    if name in ex:
        print(f"    [skip] {name} -> {ex[name]['id']}"); return ex[name]["id"]
    f={"type":ftype,"name":name,"label":label,"objectMetadataId":oid,"isActive":True,"isLabelSyncedWithName":False}
    if icon: f["icon"]=icon
    if desc: f["description"]=desc
    if options is not None: f["options"]=options
    if relation is not None: f["relationCreationPayload"]=relation
    if default is not None: f["defaultValue"]=default
    d=die(meta("""mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name type}}""",
        {"input":{"field":f}}),f"createField {name}")
    i=d["createOneField"]["id"]; print(f"    [created] {name} ({ftype}) -> {i}"); time.sleep(0.25); return i

def opt(v,l,c,p): return {"value":v,"label":l,"color":c,"position":p}

print("== suitePackage ==")
SP=mk_object("suitePackage","suitePackages","Suite","Suites","IconBuildingStadium",
   "A season suite package ANC holds at a stadium - capacity, parking, F&B terms and venue contacts.")
mk_field(SP,"stadium","Stadium","TEXT",icon="IconBuildingStadium")
mk_field(SP,"suiteNumber","Suite #","TEXT",icon="IconHash")
mk_field(SP,"teams","Teams","TEXT",icon="IconShirtSport",desc="Teams playing out of this suite")
mk_field(SP,"ticketsTotal","Tickets per Game","NUMBER",icon="IconTicket")
mk_field(SP,"ticketDetail","Ticket Detail","TEXT",icon="IconTicket")
mk_field(SP,"fieldPasses","Field Passes","TEXT",icon="IconRun")
mk_field(SP,"parkingTotal","Parking Passes","NUMBER",icon="IconCar")
mk_field(SP,"parkingDetail","Parking Detail","TEXT",icon="IconCar")
mk_field(SP,"suiteLocation","Location / Entrance","TEXT",icon="IconMapPin")
mk_field(SP,"foodBeverage","F&B Terms","TEXT",icon="IconToolsKitchen2")
mk_field(SP,"venueContacts","Venue Contacts","TEXT",icon="IconAddressBook")
mk_field(SP,"suiteNotes","Notes","TEXT",icon="IconNotes")
mk_field(SP,"suiteLinks","Links","LINKS",icon="IconLink")

print("\n== suiteGame ==")
SG=mk_object("suiteGame","suiteGames","Suite Game","Suite Games","IconTicket",
   "One game night in ANC's NFL suite ticket bank - who it is held for, which account it serves, and whether tickets went out.")
mk_field(SG,"gameDate","Game Date","DATE",icon="IconCalendar")
mk_field(SG,"dayOfWeek","Day","TEXT",icon="IconCalendarWeek")
mk_field(SG,"kickoff","Kickoff","TEXT",icon="IconClock")
mk_field(SG,"scheduleNote","Schedule Note","TEXT",icon="IconCalendarQuestion",
         desc="Used when the date is not fixed yet (e.g. Week 18, TBD)")
mk_field(SG,"homeTeam","Home Team","RELATION",icon="IconHome",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":COMPANY,
             "targetFieldLabel":"Home Suite Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"awayTeam","Away Team","RELATION",icon="IconPlane",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":COMPANY,
             "targetFieldLabel":"Away Suite Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"stadium","Stadium","TEXT",icon="IconBuildingStadium")
mk_field(SG,"suite","Suite","RELATION",icon="IconBuildingStadium",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":SP,
             "targetFieldLabel":"Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"seasonType","Season","SELECT",icon="IconCalendarStats",options=[
   opt("PRESEASON","PreSeason","gray",0),opt("REGULAR_SEASON","Regular Season","blue",1),
   opt("SPECIALTY_GAME","Specialty Game","purple",2),opt("TBD","TBD","yellow",3)])
mk_field(SG,"bankStatus","Status","SELECT",icon="IconProgressCheck",options=[
   opt("OPEN","Open","gray",0),opt("HELD","Held","yellow",1),opt("ASSIGNED","Assigned","blue",2),
   opt("TICKETS_SENT","Tickets Sent","green",3),opt("FOR_SALE","For Sale","orange",4),
   opt("SOLD","Sold","purple",5)])
mk_field(SG,"ancHost","ANC Host","TEXT",icon="IconUserCheck",desc="Who from ANC is hosting or holding the suite")
mk_field(SG,"guestCompany","Guest Account","RELATION",icon="IconBuilding",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":COMPANY,
             "targetFieldLabel":"Suite Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"guestContact","Guest Contact","RELATION",icon="IconUser",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":PERSON,
             "targetFieldLabel":"Suite Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"guestEmails","Send Tickets To","EMAILS",icon="IconMail")
mk_field(SG,"seatsCommitted","Seats Committed","NUMBER",icon="IconArmchair")
mk_field(SG,"ticketsSent","Tickets Sent","BOOLEAN",icon="IconTicket",default=False)
mk_field(SG,"parkingSent","Parking Sent","BOOLEAN",icon="IconCar",default=False)
mk_field(SG,"opportunity","Opportunity","RELATION",icon="IconTargetArrow",
   relation={"type":"MANY_TO_ONE","targetObjectMetadataId":OPPORTUNITY,
             "targetFieldLabel":"Suite Games","targetFieldIcon":"IconTicket"})
mk_field(SG,"bookingNotes","Booking Notes","TEXT",icon="IconClipboardText")
mk_field(SG,"gameNotes","Game Notes","TEXT",icon="IconNotes")

print(f"\nSUITE_PACKAGE_OBJECT={SP}\nSUITE_GAME_OBJECT={SG}")
