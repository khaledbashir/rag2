-- Repair: the running twenty image (v2.17.0 custom build) inserts into
-- core."searchFieldMetadata" WITHOUT "tsVectorFieldMetadataId", but the DB has that
-- column NOT NULL -> every createOneObject fails. The value is fully determined by
-- the object: it is that object's own TS_VECTOR (searchVector) field. Fill it when
-- the application omits it. No-op once the image ships code that sets it.
CREATE OR REPLACE FUNCTION core.anc_fill_search_field_tsvector() RETURNS trigger AS $$
BEGIN
  IF NEW."tsVectorFieldMetadataId" IS NULL THEN
    SELECT f.id INTO NEW."tsVectorFieldMetadataId"
      FROM core."fieldMetadata" f
     WHERE f."objectMetadataId" = NEW."objectMetadataId"
       AND f.type = 'TS_VECTOR'
     ORDER BY f."createdAt"
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS anc_fill_search_field_tsvector_trg ON core."searchFieldMetadata";
CREATE TRIGGER anc_fill_search_field_tsvector_trg
  BEFORE INSERT ON core."searchFieldMetadata"
  FOR EACH ROW EXECUTE FUNCTION core.anc_fill_search_field_tsvector();
