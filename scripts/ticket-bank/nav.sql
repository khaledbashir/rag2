\set ws '''d3fbc29a-a635-48b7-9d6e-250941677fd0'''
\set app '''d53ff8e7-6a2d-498b-8e87-7cf0f4d1c7ed'''

-- folder: Tickets & Suites, between Media & Sponsorships (24) and Advertising (25)
INSERT INTO core."navigationMenuItem"
 (id,"universalIdentifier","workspaceId","applicationId",name,type,position,icon)
VALUES ('b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31','b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31',
        :ws,:app,'Tickets & Suites','FOLDER',24.5,'IconTicket')
ON CONFLICT (id) DO NOTHING;

-- views inside the folder (name NULL -> inherits the view's own name)
INSERT INTO core."navigationMenuItem"
 (id,"universalIdentifier","workspaceId","applicationId","viewId",type,position,"folderId")
VALUES
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'feb1aeca-8285-4a88-aec3-600bfa7fa240','VIEW',0,'b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31'),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'ca930c92-f909-4ab6-8d6e-918c7c6c9f96','VIEW',1,'b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31'),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'ec2adc64-c0cb-4663-b7e7-f59f42ee5ac5','VIEW',2,'b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31'),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'b9ff2245-6dad-4bfc-b05c-5a676ee4e33e','VIEW',3,'b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31'),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'89bb9feb-dd19-441a-a62f-c175c7131100','VIEW',4,'b1d5c7a2-6f43-4c8e-9a71-2e5d8f0c4b31');

-- personal sidebar pins: Jireh + Kirsten (owns the spreadsheet today)
INSERT INTO core."navigationMenuItem"
 (id,"universalIdentifier","workspaceId","applicationId","userWorkspaceId","viewId",type,position)
VALUES
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'c6de56e5-95dd-48a1-8ff8-0cf3583a63e8','feb1aeca-8285-4a88-aec3-600bfa7fa240','VIEW',0),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'ec0add4d-1f1d-45b5-bc24-09dab3fd29fa','feb1aeca-8285-4a88-aec3-600bfa7fa240','VIEW',0),
 (uuid_generate_v4(),uuid_generate_v4(),:ws,:app,'ec0add4d-1f1d-45b5-bc24-09dab3fd29fa','ca930c92-f909-4ab6-8d6e-918c7c6c9f96','VIEW',1);
